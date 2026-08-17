import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Proxy serveur vers OpenRouteService (clé API secrète, jamais exposée au navigateur) : calcule
// jusqu'à 3 itinéraires distincts (voir alternative_routes) entre la position d'une personne et
// un domaine, pour la carte du personnel (RoutesLayer / RoutesPanel dans personnel-carte.tsx).
// Kamel, 2026-08-16 : OSRM (gratuit, sans clé) donnait des itinéraires peu fiables sur cette zone
// rurale de Marrakech (parfois un seul tracé, parfois faux) — ORS est plus robuste et propose un
// vrai paramètre "alternative_routes".
type OrsFeature = {
  geometry: { coordinates: [number, number][] };
  properties: { summary: { duration: number; distance: number } };
};

export async function GET(request: Request): Promise<NextResponse> {
  await auth.protect();

  const { searchParams } = new URL(request.url);
  const originLat = Number(searchParams.get("originLat"));
  const originLng = Number(searchParams.get("originLng"));
  const destLat = Number(searchParams.get("destLat"));
  const destLng = Number(searchParams.get("destLng"));
  if ([originLat, originLng, destLat, destLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ORS_API_KEY non configurée" }, { status: 500 });
  }

  const orsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [
        [originLng, originLat],
        [destLng, destLat],
      ],
      alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 },
      instructions: false,
    }),
  });

  if (!orsRes.ok) {
    return NextResponse.json({ error: "Itinéraire indisponible" }, { status: 502 });
  }

  const data: { features?: OrsFeature[] } = await orsRes.json();
  const routes = (data.features ?? []).map((f) => ({
    coords: f.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    durationSec: f.properties.summary.duration,
    distanceM: f.properties.summary.distance,
  }));

  return NextResponse.json({ routes });
}
