"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { MessageCircle, MapPin, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toWhatsAppUrl } from "@/lib/phone";
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

function staffColorClass(roles: ("menage" | "cuisine")[]) {
  const hasMenage = roles.includes("menage");
  const hasCuisine = roles.includes("cuisine");
  if (hasMenage && hasCuisine) return "bg-blue-500";
  return hasMenage ? "bg-orange-500" : "bg-purple-500";
}

// Silhouette plutôt que des lettres (M/C/MC) : la couleur porte déjà le rôle (voir la légende
// sous la carte), pas besoin de le répéter en texte sur le marqueur. Kamel, 2026-08-12.
function pastilleIcon(colorClass: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);" class="${colorClass}">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Trait fin (icône maison, style lucide) plutôt qu'un emoji ou un pictogramme plein — juste de
// quoi reconnaître "c'est un domaine" d'un coup d'œil, sans couleur criarde. Kamel, 2026-08-12 :
// "il me faut juste comme des traits fins".
const domaineIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:white;border:1.5px solid #334155;box-shadow:0 1px 3px rgba(0,0,0,0.25);">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

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

function FlyToSelected({
  selectedId,
  staff,
  markerRefs,
}: {
  selectedId: string | null;
  staff: CarteStaff[];
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const s = staff.find((p) => p.id === selectedId);
    if (!s || s.latitude === null || s.longitude === null) return;
    map.flyTo([s.latitude, s.longitude], 14, { duration: 0.8 });
    const marker = markerRefs.current.get(selectedId);
    marker?.openPopup();
  }, [selectedId, staff, map, markerRefs]);
  return null;
}

export function PersonnelCarte({ staff, domaines }: { staff: CarteStaff[]; domaines: CarteDomaine[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const points = [...staff.filter((s) => s.latitude !== null).map((s) => [s.latitude!, s.longitude!] as [number, number]), ...domaines.map((d) => [d.latitude, d.longitude] as [number, number])];
  const center: [number, number] = points.length > 0 ? points[0] : [31.6295, -7.9811];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden py-0">
        <div className="relative">
          <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: "440px", width: "100%" }}>
            {/* Voyager (CARTO) plutôt que le rendu OSM standard : routes bien plus lisibles
                (couleurs distinctes par type de route, labels clairs), gratuit et sans clé API. */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
            <FlyToSelected selectedId={selectedId} staff={staff} markerRefs={markerRefs} />
            {domaines.map((d) => (
              <Marker key={d.id} position={[d.latitude, d.longitude]} icon={domaineIcon}>
                <Popup>
                  <span className="font-semibold">{d.nom}</span>
                </Popup>
              </Marker>
            ))}
            {staff
              .filter((s): s is CarteStaff & { latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null)
              .map((s) => (
                <Marker
                  key={s.id}
                  position={[s.latitude, s.longitude]}
                  icon={pastilleIcon(staffColorClass(s.roles))}
                  ref={(instance) => {
                    if (instance) markerRefs.current.set(s.id, instance);
                  }}
                  eventHandlers={{ click: () => setSelectedId(s.id) }}
                >
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
                              {d.domaineNom} — <span className="font-medium text-foreground">{d.km.toFixed(1)} km</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {s.telephone ? <WhatsAppLink phone={s.telephone} className="mt-1" /> : null}
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Personnel — la plus proche d&apos;abord</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">Personne d&apos;actif pour l&apos;instant.</p>
          ) : (
            staff.map((s) => {
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
                    selectedId === s.id && "border-primary bg-muted/50"
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
                      <div className="flex items-center gap-1.5">
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
                            <span className="font-medium text-foreground">{proche.km.toFixed(1)} km</span> de {proche.domaineNom}
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
  );
}
