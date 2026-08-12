"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { MessageCircle, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  // Triée par distance croissante — vide si position inconnue.
  distances: { domaineId: string; domaineNom: string; km: number }[];
};

const ROLE_STYLE: Record<"menage" | "cuisine", { label: string; dot: string; badge: string }> = {
  menage: { label: "Ménage", dot: "bg-orange-500", badge: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  cuisine: { label: "Cuisine", dot: "bg-purple-500", badge: "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400" },
};

function staffColorClass(roles: ("menage" | "cuisine")[]) {
  const hasMenage = roles.includes("menage");
  const hasCuisine = roles.includes("cuisine");
  if (hasMenage && hasCuisine) return "bg-blue-500";
  return hasMenage ? "bg-orange-500" : "bg-purple-500";
}

function staffLabel(roles: ("menage" | "cuisine")[]) {
  const hasMenage = roles.includes("menage");
  const hasCuisine = roles.includes("cuisine");
  if (hasMenage && hasCuisine) return "MC";
  return hasMenage ? "M" : "C";
}

function pastilleIcon(label: string, colorClass: string, initiale: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;border:2.5px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.4);font-size:12px;font-weight:700;color:white;" class="${colorClass}">${initiale}</div>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

const domaineIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#0f172a;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);font-size:16px;">🏡</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17],
});

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
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyToSelected selectedId={selectedId} staff={staff} markerRefs={markerRefs} />
            {domaines.map((d) => (
              <Marker key={d.id} position={[d.latitude, d.longitude]} icon={domaineIcon}>
                <Popup>
                  <span className="font-semibold">🏡 {d.nom}</span>
                </Popup>
              </Marker>
            ))}
            {staff
              .filter((s): s is CarteStaff & { latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null)
              .map((s) => (
                <Marker
                  key={s.id}
                  position={[s.latitude, s.longitude]}
                  icon={pastilleIcon(staffLabel(s.roles), staffColorClass(s.roles), staffLabel(s.roles))}
                  ref={(instance) => {
                    if (instance) markerRefs.current.set(s.id, instance);
                  }}
                  eventHandlers={{ click: () => setSelectedId(s.id) }}
                >
                  <Popup>
                    <div className="min-w-44 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{s.nom}</span>
                        {s.roles.map((r) => (
                          <span key={r} className={cn("rounded-full border px-1.5 py-0 text-[10px] font-medium", ROLE_STYLE[r].badge)}>
                            {ROLE_STYLE[r].label}
                          </span>
                        ))}
                      </div>
                      {s.distances.length > 0 ? (
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {s.distances.map((d) => (
                            <li key={d.domaineId}>
                              🏡 {d.domaineNom} — <span className="font-medium text-foreground">{d.km.toFixed(1)} km</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {s.telephone ? (
                        <a
                          href={toWhatsAppUrl(s.telephone)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex w-fit items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3 w-3" />
                          WhatsApp
                        </a>
                      ) : null}
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
        <span className="flex items-center gap-1.5">🏡 Domaine</span>
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
                          <span key={r} className={cn("rounded-full border px-1.5 py-0 text-[10px] font-medium", ROLE_STYLE[r].badge)}>
                            {ROLE_STYLE[r].label}
                          </span>
                        ))}
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
                  {s.telephone ? (
                    <a
                      href={toWhatsAppUrl(s.telephone)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : null}
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
