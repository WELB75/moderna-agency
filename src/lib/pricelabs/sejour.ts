import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, pricelabsPriceCache } from "@/db/schema";
import { pricelabsGetListings, pricelabsGetPrices } from "./client";
import { estDirham, getMadParEur, madVersEur } from "@/lib/devises";

// Prix d'un séjour selon PriceLabs : somme des tarifs de chaque nuit (de l'arrivée incluse au
// départ exclu). Utilise le cache de l'onglet Tarification s'il est frais et complet ; sinon
// interroge PriceLabs en direct pour cette seule annonce.

export type PrixSejour = {
  ok: boolean;
  devise: string;
  nuits: number;
  total: number;
  parNuit: { date: string; prix: number }[];
  source: "cache" | "direct" | null;
  message?: string; // raison quand ok = false
};

function ttlMs(): number {
  return (Number(process.env.PRICELABS_CACHE_TTL_HOURS) || 2) * 60 * 60 * 1000;
}

function nuitsEntre(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (const c = new Date(`${checkIn}T00:00:00Z`); c < new Date(`${checkOut}T00:00:00Z`); c.setUTCDate(c.getUTCDate() + 1)) {
    out.push(c.toISOString().slice(0, 10));
  }
  return out;
}

// Annonce PriceLabs en dirhams (Villa Wimiliim) : séjour proposé en euros comme pour les autres
// villas (le formulaire de réservation reprend alors l'euro comme devise du loyer).
async function enEuros(sejour: PrixSejour): Promise<PrixSejour> {
  if (!sejour.ok || !estDirham(sejour.devise)) return sejour;
  const madParEur = await getMadParEur();
  const parNuit = sejour.parNuit.map((n) => ({ date: n.date, prix: madVersEur(n.prix, madParEur) }));
  const total = Math.round(parNuit.reduce((s, n) => s + n.prix, 0) * 100) / 100;
  return { ...sejour, devise: "EUR", parNuit, total };
}

export async function calculerPrixSejour(villaId: string, checkIn: string, checkOut: string): Promise<PrixSejour> {
  return enEuros(await calculerPrixSejourBrut(villaId, checkIn, checkOut));
}

async function calculerPrixSejourBrut(villaId: string, checkIn: string, checkOut: string): Promise<PrixSejour> {
  const vide = (message: string): PrixSejour => ({ ok: false, devise: "EUR", nuits: 0, total: 0, parNuit: [], source: null, message });
  const dates = nuitsEntre(checkIn, checkOut);
  if (dates.length === 0) return vide("Dates invalides.");

  const db = getDb();
  const [row] = await db
    .select({
      pricelabsListingId: villas.pricelabsListingId,
      beds24PropertyId: villas.beds24PropertyId,
      beds24RoomId: villas.beds24RoomId,
      currency: pricelabsPriceCache.currency,
      days: pricelabsPriceCache.days,
      syncedAt: pricelabsPriceCache.syncedAt,
    })
    .from(villas)
    .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
    .where(eq(villas.id, villaId))
    .limit(1);
  if (!row) return vide("Logement introuvable.");

  const listingId = row.pricelabsListingId ?? (row.beds24PropertyId && row.beds24RoomId ? `${row.beds24PropertyId}___${row.beds24RoomId}` : null);
  if (!listingId) return vide("Ce logement n'est pas relié à PriceLabs.");

  const depuis = (days: { date: string; price: number | null }[], devise: string, source: "cache" | "direct"): PrixSejour | null => {
    const parDate = new Map(days.map((d) => [d.date, d.price]));
    const parNuit: { date: string; prix: number }[] = [];
    for (const date of dates) {
      const p = parDate.get(date);
      if (p == null) return null;
      parNuit.push({ date, prix: Number(p) });
    }
    const total = Math.round(parNuit.reduce((s, n) => s + n.prix, 0) * 100) / 100;
    return { ok: true, devise, nuits: parNuit.length, total, parNuit, source };
  };

  const cacheDays = (row.days as { date: string; price: number | null }[] | null) ?? [];
  const cacheFrais = row.syncedAt ? Date.now() - row.syncedAt.getTime() <= ttlMs() : false;
  const depuisCache = depuis(cacheDays, row.currency ?? "EUR", "cache");
  if (depuisCache && cacheFrais) return depuisCache;

  try {
    const listings = await pricelabsGetListings();
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return depuisCache ?? vide("Annonce PriceLabs introuvable.");
    const [res] = await pricelabsGetPrices([{ id: listing.id, pms: listing.pms }], dates[0], checkOut);
    if (!res || res.error) return depuisCache ?? vide(res?.error ?? "Réponse PriceLabs vide.");
    const direct = depuis(res.data ?? [], res.currency ?? listing.currency ?? row.currency ?? "EUR", "direct");
    if (direct) return direct;
  } catch (err) {
    console.error("[pricelabs] calcul séjour :", err);
  }
  return depuisCache ?? vide("Prix PriceLabs indisponibles pour ces dates.");
}
