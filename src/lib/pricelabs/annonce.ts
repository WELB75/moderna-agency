import type { PricelabsListing } from "./client";

// Annonce PriceLabs d'un logement. Depuis la bascule sur Beds24 (octobre 2026), PriceLabs pousse
// ses prix vers Beds24, qui les envoie à Airbnb/Booking.com : l'annonce Beds24 du logement
// ("propriété___chambre", ex. 360249___742737) est donc la source des vrais prix, en priorité.
// L'annonce reliée à la main (pricelabsListingId, souvent l'ancienne annonce Airbnb directe) ne
// sert plus que de secours. Fouad, 2026-10-15 : Villa Wimiliim affichait les prix de son
// ancienne annonce Airbnb en dirhams au lieu de son annonce Beds24 en euros (220/310/600).
export function annoncesCandidates(v: {
  pricelabsListingId: string | null;
  beds24PropertyId: string | null;
  beds24RoomId: string | null;
}): string[] {
  const beds24 = v.beds24PropertyId && v.beds24RoomId ? `${v.beds24PropertyId}___${v.beds24RoomId}` : null;
  return [beds24, v.pricelabsListingId].filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i);
}

// Première candidate qui existe dans PriceLabs, en préférant une annonce visible dont la
// synchronisation des prix est active (c'est elle qui fixe les prix réels).
export function choisirAnnonce(candidates: string[], listingById: Map<string, PricelabsListing>): PricelabsListing | null {
  const trouvees = candidates.map((id) => listingById.get(id)).filter((l): l is PricelabsListing => Boolean(l));
  return (
    trouvees.find((l) => !l.isHidden && l.push_enabled !== false) ??
    trouvees.find((l) => !l.isHidden) ??
    trouvees[0] ??
    null
  );
}
