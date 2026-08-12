"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

export type MapStaffPoint = {
  id: string;
  nom: string;
  roles: ("menage" | "cuisine")[];
  latitude: number;
  longitude: number;
};

export type MapDomainePoint = {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
};

// Icônes en HTML (pas d'image à charger) : évite le problème classique des chemins d'icône
// Leaflet par défaut cassés par les bundlers, et permet de distinguer d'un coup d'œil ménage
// (orange), cuisine (violet), et domaine (noir, plus grand).
function pastilleIcon(label: string, colorClass: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);font-size:11px;font-weight:700;color:white;" class="${colorClass}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const domaineIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#0f172a;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export function PersonnelMap({ staff, domaines }: { staff: MapStaffPoint[]; domaines: MapDomainePoint[] }) {
  const points = [...staff.map((s) => [s.latitude, s.longitude] as [number, number]), ...domaines.map((d) => [d.latitude, d.longitude] as [number, number])];
  const center: [number, number] = points.length > 0 ? points[0] : [31.6295, -7.9811]; // Marrakech par défaut

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: "420px", width: "100%", borderRadius: "0.5rem" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {domaines.map((d) => (
        <Marker key={d.id} position={[d.latitude, d.longitude]} icon={domaineIcon}>
          <Popup>{d.nom}</Popup>
        </Marker>
      ))}
      {staff.map((s) => {
        const label = s.roles.includes("menage") && s.roles.includes("cuisine") ? "MC" : s.roles.includes("menage") ? "M" : "C";
        const colorClass = s.roles.includes("menage") && !s.roles.includes("cuisine") ? "bg-orange-500" : s.roles.includes("cuisine") && !s.roles.includes("menage") ? "bg-purple-500" : "bg-blue-500";
        return (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={pastilleIcon(label, colorClass)}>
            <Popup>{s.nom}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
