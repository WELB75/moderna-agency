"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MessageCircle, MapPin, Home, Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toWhatsAppUrl } from "@/lib/phone";
import { distanceKm } from "@/lib/geo";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export type CarteDomaine = { id: string; nom: string; latitude: number; longitude: number };

export type CarteStaff = {
  id: string;
  nom: string;
  telephone: string | null;
  roles: ("menage" | "cuisine")[];
  latitude: number | null;
  longitude: number | null;
  positionMajAt: Date | null;
  occupeAujourdhui: boolean;
  // Triée par distance croissante — vide si position inconnue.
  distances: { domaineId: string; domaineNom: string; km: number }[];
};

const ROLE_LABEL: Record<"menage" | "cuisine", string> = { menage: "Ménage", cuisine: "Cuisine" };

// Nom d'usage de Kamel pour les domaines, différent du nom en base (historique — voir
// "Domaine Zaraba" dans db/schema.ts) : sur la carte, on affiche toujours le nom qu'il utilise
// à l'oral ("Moderna 1", "Moderna 2"), pas le nom technique de la fiche.
const DOMAINE_LABELS: Record<string, string> = {
  "Domaine Zaraba": "Moderna 1",
  "Domaine Moderna II": "Moderna 2",
  Noria: "Noria",
};
function domaineLabel(nom: string): string {
  return DOMAINE_LABELS[nom] ?? nom;
}

function staffColorClass(roles: ("menage" | "cuisine")[]) {
  const hasMenage = roles.includes("menage");
  const hasCuisine = roles.includes("cuisine");
  if (hasMenage && hasCuisine) return "bg-blue-500";
  return hasMenage ? "bg-orange-500" : "bg-purple-500";
}

// Minimalisme, même charte que l'icône domaine : fond blanc, icône en trait fin (noir/gris
// foncé), pas de rond plein coloré — trop de couleurs sur la carte. Kamel, 2026-08-13 : "on va
// rester dans la même charte graphique que les icônes... fond blanc, icône noir pour tous...
// trop de couleurs j'aime pas". Deux petites pastilles portent l'info utile : à gauche le rôle
// (orange ménage / violet cuisine / bleu les deux), à droite la disponibilité (vert/rouge) —
// gardée telle quelle, c'est le seul usage de couleur que Kamel veut conserver.
function pastilleIcon(roleColorClass: string, occupe: boolean) {
  const statutColor = occupe ? "#ef4444" : "#22c55e";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:white;border:1.5px solid #334155;box-shadow:0 1px 4px rgba(0,0,0,0.3);">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div style="position:absolute;bottom:-1px;left:-1px;width:9px;height:9px;border-radius:9999px;border:1.5px solid white;" class="${roleColorClass}"></div>
      <div style="position:absolute;bottom:-1px;right:-1px;width:9px;height:9px;border-radius:9999px;background:${statutColor};border:1.5px solid white;"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Trait fin (icône maison, style lucide) — même esprit minimaliste que les marqueurs personnel,
// mais couleurs inversées (fond noir, icône blanche) pour que les domaines restent toujours
// reconnaissables d'un coup d'œil au milieu de tout le personnel blanc. Kamel, 2026-08-13 :
// "les domaines en vrai faut inverser fond noir, icone blanche... qu'on voit toujours les
// domaines visible aussi". Voir aussi zIndexOffset sur le Marker (MarkersLayer) : passe toujours
// devant un marqueur personnel qui le chevaucherait.
const domaineIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#0f172a;border:1.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

// Itinéraires voiture façon Waze/Google Maps quand on sélectionne quelqu'un : jusqu'à 3 tracés
// distincts vers le domaine le plus proche (celui déjà en tête de s.distances), avec durée —
// calculés via OSRM (moteur gratuit, sans clé API, cohérent avec les tuiles CARTO déjà utilisées
// ici). Kamel, 2026-08-16 : "je veux les 3 itineraire avec durée en voiture jusqu'au domaine avec
// 3 couleurs différentes par tracé".
const ROUTE_COLORS = ["#2563eb", "#f97316", "#16a34a"]; // bleu, orange, vert

type RouteOption = { coords: [number, number][]; durationSec: number; distanceM: number };
type OsrmRoute = { duration: number; distance: number; geometry: { coordinates: [number, number][] } };

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

function useDrivingRoutes(origin: [number, number] | null, destination: [number, number] | null) {
  const [state, setState] = useState<{ routes: RouteOption[]; loading: boolean; error: string | null }>({
    routes: [],
    loading: false,
    error: null,
  });

  const key = origin && destination ? `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` : null;

  useEffect(() => {
    if (!key || !origin || !destination) return;
    const controller = new AbortController();
    setState({ routes: [], loading: true, error: null });
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?alternatives=true&overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("request-failed");
        return res.json();
      })
      .then((data: { code: string; routes?: OsrmRoute[] }) => {
        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) throw new Error("no-route");
        const routes: RouteOption[] = data.routes.slice(0, 3).map((r) => ({
          coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
          durationSec: r.duration,
          distanceM: r.distance,
        }));
        setState({ routes, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ routes: [], loading: false, error: "Itinéraire indisponible" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume déjà origin+destination
  }, [key]);

  if (!origin || !destination) return { routes: [], loading: false, error: null };
  return state;
}

function RoutesLayer({ routes }: { routes: RouteOption[] }) {
  return (
    <>
      {routes.map((route, i) => (
        <Polyline
          key={i}
          positions={route.coords}
          pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: i === 0 ? 5 : 4, opacity: i === 0 ? 0.9 : 0.55 }}
        />
      ))}
    </>
  );
}

function RoutesPanel({
  routes,
  loading,
  error,
  domaineNom,
}: {
  routes: RouteOption[];
  loading: boolean;
  error: string | null;
  domaineNom: string;
}) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[400] max-w-[230px]">
      <div className="pointer-events-auto rounded-lg border bg-background/95 p-2.5 shadow-lg backdrop-blur-sm">
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Vers {domaineLabel(domaineNom)} en voiture</p>
        {loading ? (
          <p className="text-xs text-muted-foreground">Calcul de l&apos;itinéraire…</p>
        ) : error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : (
          <ul className="space-y-1">
            {routes.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                <span className="font-medium text-foreground">{formatDuration(r.durationSec)}</span>
                <span className="text-muted-foreground">· {(r.distanceM / 1000).toFixed(1)} km</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DisponibiliteBadge({ occupe }: { occupe: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <span className={cn("h-1.5 w-1.5 rounded-full", occupe ? "bg-red-500" : "bg-green-500")} />
      <span className={cn(occupe ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
        {occupe ? "Occupée" : "Disponible"}
      </span>
    </span>
  );
}

function WhatsAppLink({ phone, className }: { phone: string; className?: string }) {
  return (
    <a
      href={toWhatsAppUrl(phone)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted",
        className
      )}
    >
      <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      WhatsApp
    </a>
  );
}

// Plusieurs personnes peuvent partager exactement la même position (ex. colocataires) — sans
// décalage, leurs marqueurs se superposent pile et une seule reste visible/cliquable. On les
// écarte légèrement en cercle autour du point réel, uniquement pour l'AFFICHAGE (les distances
// aux domaines, elles, restent calculées sur la vraie position). Kamel, 2026-08-12 : "on voit
// pas les 3, écarte-les un peu qu'elles soient visibles direct".
const RAYON_ECART_DEGRES = 0.007; // ~770m, pour rester distinctes même dans la vue "tout voir" au chargement

type TooltipDirection = "right" | "left" | "top" | "bottom";
type DisplayPosition = { position: [number, number]; direction: TooltipDirection };

// L'étiquette (nom en permanence affiché) part toujours vers la droite par défaut — pour un
// groupe écarté en cercle, ça les fait toutes se chevaucher au même endroit même si les points
// eux-mêmes sont séparés. On fait pointer chaque étiquette vers l'extérieur du cercle (l'axe
// dominant de son angle), pas toujours à droite. Kamel, 2026-08-12 : "elles se chevauchent".
function directionForAngle(angle: number): TooltipDirection {
  const composanteEst = Math.cos(angle);
  const composanteNord = Math.sin(angle);
  if (Math.abs(composanteEst) >= Math.abs(composanteNord)) return composanteEst >= 0 ? "right" : "left";
  return composanteNord >= 0 ? "top" : "bottom";
}

// Regrouper seulement les coordonnées EXACTEMENT identiques ratait un cas réel : deux personnes
// qui n'habitent pas au même endroit mais suffisamment proches pour que leurs marqueurs se
// chevauchent quand même à faible zoom — la pastille dispo/occupée de l'une se retrouvait
// entièrement cachée sous le marqueur de l'autre (repéré par Kamel, 2026-08-13 : "on voit pas si
// c'est vert ou rouge"). Un simple chevauchement de couleur se voit encore ; une pastille
// complètement recouverte, non — donc on regroupe par PROXIMITÉ (clustering glouton), pas par
// égalité stricte.
const SEUIL_PROXIMITE_KM = 1;

function declusterPositions(staff: CarteStaff[]): Map<string, DisplayPosition> {
  const avecPosition = staff.filter(
    (s): s is CarteStaff & { latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null
  );
  const clusters: { lat: number; lng: number; membres: CarteStaff[] }[] = [];
  for (const s of avecPosition) {
    const proche = clusters.find((c) => distanceKm(c.lat, c.lng, s.latitude, s.longitude) < SEUIL_PROXIMITE_KM);
    if (proche) proche.membres.push(s);
    else clusters.push({ lat: s.latitude, lng: s.longitude, membres: [s] });
  }
  const positions = new Map<string, DisplayPosition>();
  for (const cluster of clusters) {
    if (cluster.membres.length === 1) {
      const s = cluster.membres[0];
      positions.set(s.id, { position: [s.latitude!, s.longitude!], direction: "right" });
      continue;
    }
    // Écart autour du centre du groupe (moyenne), pas juste de la première personne — plus
    // naturel quand les positions réelles ne sont pas déjà toutes au même point.
    const centreLat = cluster.membres.reduce((somme, s) => somme + s.latitude!, 0) / cluster.membres.length;
    const centreLng = cluster.membres.reduce((somme, s) => somme + s.longitude!, 0) / cluster.membres.length;
    const correctionLongitude = Math.cos((centreLat * Math.PI) / 180) || 1;
    cluster.membres.forEach((s, i) => {
      const angle = (2 * Math.PI * i) / cluster.membres.length;
      positions.set(s.id, {
        position: [centreLat + RAYON_ECART_DEGRES * Math.sin(angle), centreLng + (RAYON_ECART_DEGRES * Math.cos(angle)) / correctionLongitude],
        direction: directionForAngle(angle),
      });
    });
  }
  return positions;
}

// En dessous de ce zoom, trop de marqueurs sont proches les uns des autres à l'écran pour que
// leurs étiquettes tiennent sans se marcher dessus (vu sur la vue "tout voir" avec le personnel
// groupé autour de Marrakech) — au-delà, les étiquettes réapparaissent. Kamel, 2026-08-12 :
// "trouve un moyen que ce soit plus propre, ça fait brouillon".
const ZOOM_MIN_ETIQUETTES = 13;

function useZoomActuel() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return zoom;
}

// Au chargement, on veut toujours tout voir d'un coup (domaines + personnel) plutôt qu'un
// centrage/zoom fixe qui peut couper des marqueurs éloignés — Kamel, 2026-08-12 : "quand on se
// connecte je veux toujours voir tout sur la map". Seulement au montage (pas à chaque
// sélection dans la liste, sinon ça annulerait le fly-to de FlyToSelected).
function FitAllOnMount({ points }: { points: [number, number][] }) {
  const map = useMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement une seule fois, au montage
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, []);
  return null;
}

function FlyToSelected({
  selectedId,
  displayPositions,
  markerRefs,
}: {
  selectedId: string | null;
  displayPositions: Map<string, DisplayPosition>;
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const entry = displayPositions.get(selectedId);
    if (!entry) return;
    map.flyTo(entry.position, 14, { duration: 0.8 });
    const marker = markerRefs.current.get(selectedId);
    marker?.openPopup();
  }, [selectedId, displayPositions, map, markerRefs]);
  return null;
}

// Rendu des marqueurs (domaines + personnel), séparé de PersonnelCarte parce que useZoomActuel
// (comme useMap) n'est utilisable que dans un descendant de MapContainer.
function MarkersLayer({
  domaines,
  staff,
  displayPositions,
  setSelectedId,
  setHoveredId,
  markerRefs,
}: {
  domaines: CarteDomaine[];
  staff: CarteStaff[];
  displayPositions: Map<string, DisplayPosition>;
  setSelectedId: (id: string) => void;
  setHoveredId: (id: string | null) => void;
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const zoom = useZoomActuel();
  const afficherEtiquettes = zoom >= ZOOM_MIN_ETIQUETTES;

  return (
    <>
      {domaines.map((d) => (
        <Marker key={d.id} position={[d.latitude, d.longitude]} icon={domaineIcon} zIndexOffset={1000}>
          {afficherEtiquettes ? (
            <Tooltip permanent direction="top" offset={[0, -12]} className="!border-slate-300 !bg-white/90 !py-0.5 !text-[11px] !font-medium !text-slate-700">
              {domaineLabel(d.nom)}
            </Tooltip>
          ) : null}
          <Popup>
            <span className="font-semibold">{domaineLabel(d.nom)}</span>
          </Popup>
        </Marker>
      ))}
      {staff
        .filter((s) => displayPositions.has(s.id))
        .map((s) => {
          const { position, direction } = displayPositions.get(s.id)!;
          const offset: [number, number] =
            direction === "right" ? [10, 0] : direction === "left" ? [-10, 0] : direction === "top" ? [0, -10] : [0, 10];
          return (
            <Marker
              key={s.id}
              position={position}
              icon={pastilleIcon(staffColorClass(s.roles), s.occupeAujourdhui)}
              ref={(instance) => {
                if (instance) markerRefs.current.set(s.id, instance);
              }}
              eventHandlers={{
                click: () => setSelectedId(s.id),
                mouseover: () => setHoveredId(s.id),
                mouseout: () => setHoveredId(null),
              }}
            >
              {afficherEtiquettes ? (
                <Tooltip permanent direction={direction} offset={offset} className="!border-slate-300 !bg-white/90 !py-0.5 !text-[11px] !font-medium !text-slate-700">
                  {s.nom}
                </Tooltip>
              ) : null}
              <Popup>
                <div className="min-w-44 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.nom}</span>
                    <DisponibiliteBadge occupe={s.occupeAujourdhui} />
                  </div>
                  <div className="flex items-center gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r} variant="outline" className="text-[10px]">
                        {ROLE_LABEL[r]}
                      </Badge>
                    ))}
                  </div>
                  {s.distances.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {s.distances.map((d) => (
                        <li key={d.domaineId}>
                          {domaineLabel(d.domaineNom)} — <span className="font-medium text-foreground">{d.km.toFixed(1)} km</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.telephone ? <WhatsAppLink phone={s.telephone} className="mt-1" /> : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
    </>
  );
}

export function PersonnelCarte({ staff, domaines }: { staff: CarteStaff[]; domaines: CarteDomaine[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  // La recherche filtre la liste ET les marqueurs affichés sur la carte (moins de bruit pour
  // repérer quelqu'un) — s'il ne reste qu'une seule personne, on vole directement vers elle.
  // Kamel, 2026-08-13 : "trouver direct sur le plan et la barre latérale".
  const staffFiltre = recherche ? staff.filter((s) => matchesSearch(s.nom, recherche)) : staff;
  useEffect(() => {
    if (staffFiltre.length === 1 && staffFiltre[0].latitude !== null) {
      setSelectedId(staffFiltre[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement quand la recherche change, pas à chaque frappe de sélection
  }, [recherche]);

  const displayPositions = declusterPositions(staff);
  const points = [...[...displayPositions.values()].map((d) => d.position), ...domaines.map((d) => [d.latitude, d.longitude] as [number, number])];
  const center: [number, number] = points.length > 0 ? points[0] : [31.6295, -7.9811];
  const staffOccupees = staff.filter((s) => s.occupeAujourdhui).length;
  const staffDisponibles = staff.length - staffOccupees;

  // Itinéraires vers le domaine le plus proche de la personne sélectionnée (voir RoutesLayer /
  // RoutesPanel plus haut) — réutilise s.distances, déjà trié par proximité croissante.
  const selectedStaff = selectedId ? staff.find((s) => s.id === selectedId) : undefined;
  const nearestDomaine = selectedStaff?.distances[0];
  const nearestDomaineCoords = nearestDomaine ? domaines.find((d) => d.id === nearestDomaine.domaineId) : undefined;
  const routeOrigin: [number, number] | null =
    selectedStaff?.latitude != null && selectedStaff?.longitude != null ? [selectedStaff.latitude, selectedStaff.longitude] : null;
  const routeDestination: [number, number] | null = nearestDomaineCoords
    ? [nearestDomaineCoords.latitude, nearestDomaineCoords.longitude]
    : null;
  const { routes, loading: routesLoading, error: routesError } = useDrivingRoutes(routeOrigin, routeDestination);

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:flex-row">
      <div className="order-2 space-y-3 overflow-y-auto lg:order-1 lg:w-1/3 lg:shrink-0">
        <Card>
          <CardHeader className="space-y-2 pb-2">
            <CardTitle className="text-sm font-medium">Personnel — la plus proche d&apos;abord</CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un prénom..."
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
              />
              {recherche ? (
                <button
                  type="button"
                  onClick={() => setRecherche("")}
                  aria-label="Effacer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {staffFiltre.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {staff.length === 0 ? "Personne d'actif pour l'instant." : "Aucun résultat."}
              </p>
            ) : (
              staffFiltre.map((s) => {
                const proche = s.distances[0];
                const aPosition = s.latitude !== null && s.longitude !== null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => aPosition && setSelectedId(s.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                      aPosition ? "cursor-pointer hover:bg-muted/50" : "cursor-default opacity-70",
                      (selectedId === s.id || hoveredId === s.id) && "border-primary bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                          staffColorClass(s.roles)
                        )}
                      >
                        {s.nom.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{s.nom}</span>
                          {s.roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">
                              {ROLE_LABEL[r]}
                            </Badge>
                          ))}
                          <DisponibiliteBadge occupe={s.occupeAujourdhui} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {aPosition && proche ? (
                            <>
                              <MapPin className="mr-0.5 inline h-3 w-3" />
                              <span className="font-medium text-foreground">{proche.km.toFixed(1)} km</span> de {domaineLabel(proche.domaineNom)}
                              {s.positionMajAt ? ` · maj ${formatDistanceToNow(s.positionMajAt, { locale: fr, addSuffix: true })}` : ""}
                            </>
                          ) : (
                            "Position inconnue — pas encore partagé sa localisation par WhatsApp"
                          )}
                        </p>
                      </div>
                    </div>
                    {s.telephone ? <WhatsAppLink phone={s.telephone} className="shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-2 lg:w-2/3 lg:grow">
        <Card className="overflow-hidden py-0 lg:h-full">
          <div className="relative h-full">
            {/* Sur mobile, la carte doit dominer l'écran à l'arrivée sur l'onglet (comme une vraie
                app de carte type Airbnb/Uber) plutôt qu'un petit aperçu — Kamel, 2026-08-12. */}
            <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: "70vh", width: "100%" }} className="lg:!h-full">
            {/* Voyager (CARTO) plutôt que le rendu OSM standard : routes bien plus lisibles
                (couleurs distinctes par type de route, labels clairs), gratuit et sans clé API. */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
            <FitAllOnMount points={points} />
            <FlyToSelected selectedId={selectedId} displayPositions={displayPositions} markerRefs={markerRefs} />
            <MarkersLayer
              domaines={domaines}
              staff={staffFiltre}
              displayPositions={displayPositions}
              setSelectedId={setSelectedId}
              setHoveredId={setHoveredId}
              markerRefs={markerRefs}
            />
            <RoutesLayer routes={routes} />
          </MapContainer>
          {selectedStaff && nearestDomaine ? (
            <RoutesPanel routes={routes} loading={routesLoading} error={routesError} domaineNom={nearestDomaine.domaineNom} />
          ) : null}
          {/* Résumé flottant façon Airbnb/Uber ("Plus de 1000 logements") — l'info utile
              (qui est libre) visible d'un coup d'œil, sans avoir à descendre à la liste. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[400] flex justify-center">
            <div className="rounded-full border bg-background/95 px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm">
              <span className="text-green-600 dark:text-green-400">{staffDisponibles}</span> disponible{staffDisponibles > 1 ? "s" : ""}
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span className="text-red-600 dark:text-red-400">{staffOccupees}</span> occupée{staffOccupees > 1 ? "s" : ""}
            </div>
          </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Ménage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Cuisine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Ménage + Cuisine
          </span>
          <span className="flex items-center gap-1.5">
            <Home className="h-3 w-3" /> Domaine
          </span>
        </div>
      </div>
    </div>
  );
}
