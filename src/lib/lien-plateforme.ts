import { normaliseCanal } from "@/lib/canal";

// Lien direct vers la réservation sur Airbnb / Booking.com (Sanaa, 2026-10-21 : "sur Superhote,
// j'avais un lien qui me permettait d'accéder directement à la réservation sur la plateforme").
//
// Où est la référence : les réservations venues de Superhote ont raw_data.superhote.reference
// (code Airbnb HMxxxxxxxx, ou numéro Booking) ; celles de la synchro Beds24 ont
// raw_data.beds24ApiReference / beds24ApiSource (champ "Référent original" de Beds24, ex.
// "Airbnb HMYCNMJBKB" ou "Booking.com 5124621688"). Les réservations Beds24 déjà importées avant
// le 21/10/2026 n'ont pas cette référence tant qu'elles n'ont pas été resynchronisées.

// Identifiant d'établissement Booking.com de chaque logement, indexé par la chambre Beds24
// (relevé dans Beds24 > Canaux > Booking.com > Mapping, le 20/10/2026).
const BOOKING_HOTEL_ID_PAR_CHAMBRE: Record<string, string> = {
  "742721": "13313098",
  "742722": "13312914",
  "742723": "13310352",
  "742724": "13309443",
  "742725": "13273921",
  "742726": "13310336",
  "742727": "15046299",
  "742728": "15104324",
  "742729": "15138218",
  "742730": "15399839",
  "742731": "15433396",
  "742732": "15957270",
  "742733": "16513214",
  "742734": "16753114",
  "742736": "17281671",
  "742737": "14974958",
};

function textesReference(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== "object") return [];
  const raw = rawData as Record<string, unknown>;
  const superhote = raw.superhote && typeof raw.superhote === "object" ? (raw.superhote as Record<string, unknown>) : {};
  return [raw.beds24ApiReference, raw.beds24ApiSource, superhote.reference]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
}

export function lienPlateforme(r: { canal: string | null; rawData: unknown; beds24RoomId?: string | null }): { url: string; libelle: string } | null {
  const canal = normaliseCanal(r.canal);
  const textes = textesReference(r.rawData);
  if (canal === "airbnb") {
    const code = textes.map((t) => t.match(/\bHM[A-Z0-9]{7,12}\b/)?.[0]).find(Boolean);
    return code ? { url: `https://www.airbnb.fr/hosting/stay/${code}`, libelle: "Ouvrir sur Airbnb" } : null;
  }
  if (canal === "booking") {
    const numero = textes.map((t) => t.match(/\b\d{9,10}\b/)?.[0]).find(Boolean);
    const hotelId = r.beds24RoomId ? BOOKING_HOTEL_ID_PAR_CHAMBRE[r.beds24RoomId] : undefined;
    if (!numero || !hotelId) return null;
    return { url: `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html?res_id=${numero}&hotel_id=${hotelId}`, libelle: "Ouvrir sur Booking.com" };
  }
  return null;
}
