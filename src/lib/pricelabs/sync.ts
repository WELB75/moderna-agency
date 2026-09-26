import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, pricelabsPriceCache } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { pricelabsGetListings, pricelabsGetPrices, PricelabsConfigError, type PricelabsDailyPrice } from "./client";

const JOURS_CALENDRIER = 60;

function ttlMs(): number {
  const heures = Number(process.env.PRICELABS_CACHE_TTL_HOURS) || 2;
  return heures * 60 * 60 * 1000;
}

function estPerimee(syncedAt: Date | null | undefined): boolean {
  if (!syncedAt) return true;
  return Date.now() - syncedAt.getTime() > ttlMs();
}

function dateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type TarificationVilla = {
  id: string;
  nom: string;
  numero: string;
  domaineNom: string | null;
  photoUrl: string | null;
  currency: string | null;
  minPrice: number | null;
  basePrice: number | null;
  maxPrice: number | null;
  days: { date: string; price: number | null; unbookable: boolean }[];
  syncedAt: string | null;
  error: string | null;
};

// Récupère les prix de toutes les villas reliées à PriceLabs, en resynchronisant celles dont le
// cache a dépassé PRICELABS_CACHE_TTL_HOURS (par défaut 2h) — ou toutes si force=true (bouton
// "Actualiser les prix"). Ne renvoie jamais la clé API : seules les données déjà nettoyées par
// le client PriceLabs transitent par ici.
export async function getTarification(options: { force?: boolean } = {}): Promise<TarificationVilla[]> {
  const db = getDb();

  const rows = (
    await db
      .select({
        id: villas.id,
        nom: villas.nom,
        numero: villas.numero,
        photoUrl: villas.photoUrl,
        pricelabsListingId: villas.pricelabsListingId,
        domaineNom: domaines.nom,
        cacheCurrency: pricelabsPriceCache.currency,
        cacheMinPrice: pricelabsPriceCache.minPrice,
        cacheBasePrice: pricelabsPriceCache.basePrice,
        cacheMaxPrice: pricelabsPriceCache.maxPrice,
        cacheDays: pricelabsPriceCache.days,
        cacheLastError: pricelabsPriceCache.lastError,
        cacheSyncedAt: pricelabsPriceCache.syncedAt,
      })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
      .where(and(eq(villas.type, "villa")))
  ).filter((v) => domaineEstActif(v.domaineNom) && villaEstGeree(v.nom) && v.pricelabsListingId);

  const staleVillas = rows.filter((v) => options.force || estPerimee(v.cacheSyncedAt));

  if (staleVillas.length > 0) {
    try {
      await resyncVillas(staleVillas.map((v) => ({ id: v.id, pricelabsListingId: v.pricelabsListingId! })));
    } catch (err) {
      // Panne PriceLabs (clé absente, API down, quota dépassé...) : on n'écrase rien en base,
      // les villas déjà en cache continuent d'afficher leurs derniers prix connus, et celles
      // jamais synchronisées ressortiront avec error ci-dessous.
      console.error("[pricelabs] échec de synchro globale", err instanceof PricelabsConfigError ? err.message : err);
    }
  }

  const freshRows = staleVillas.length > 0 ? await reloadCache(rows.map((v) => v.id)) : rows;

  return freshRows.map((v) => ({
    id: v.id,
    nom: v.nom,
    numero: v.numero,
    domaineNom: v.domaineNom,
    photoUrl: v.photoUrl,
    currency: v.cacheCurrency,
    minPrice: v.cacheMinPrice ? Number(v.cacheMinPrice) : null,
    basePrice: v.cacheBasePrice ? Number(v.cacheBasePrice) : null,
    maxPrice: v.cacheMaxPrice ? Number(v.cacheMaxPrice) : null,
    days: (v.cacheDays as TarificationVilla["days"] | null) ?? [],
    syncedAt: v.cacheSyncedAt ? v.cacheSyncedAt.toISOString() : null,
    error: v.cacheLastError,
  }));
}

async function reloadCache(villaIds: string[]) {
  const db = getDb();
  const rows = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      photoUrl: villas.photoUrl,
      pricelabsListingId: villas.pricelabsListingId,
      domaineNom: domaines.nom,
      cacheCurrency: pricelabsPriceCache.currency,
      cacheMinPrice: pricelabsPriceCache.minPrice,
      cacheBasePrice: pricelabsPriceCache.basePrice,
      cacheMaxPrice: pricelabsPriceCache.maxPrice,
      cacheDays: pricelabsPriceCache.days,
      cacheLastError: pricelabsPriceCache.lastError,
      cacheSyncedAt: pricelabsPriceCache.syncedAt,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
    .where(inArray(villas.id, villaIds));
  return rows;
}

async function resyncVillas(targets: { id: string; pricelabsListingId: string }[]) {
  const db = getDb();
  const listings = await pricelabsGetListings();
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const resolved = targets
    .map((t) => ({ villaId: t.id, listing: listingById.get(t.pricelabsListingId) }))
    .filter((t): t is { villaId: string; listing: NonNullable<typeof t.listing> } => Boolean(t.listing));

  const introuvables = targets.filter((t) => !listingById.has(t.pricelabsListingId));
  for (const t of introuvables) {
    await db
      .insert(pricelabsPriceCache)
      .values({ villaId: t.id, lastError: "Annonce PriceLabs introuvable (identifiant à vérifier)", syncedAt: new Date() })
      .onConflictDoUpdate({
        target: pricelabsPriceCache.villaId,
        set: { lastError: "Annonce PriceLabs introuvable (identifiant à vérifier)", syncedAt: new Date() },
      });
  }

  if (resolved.length === 0) return;

  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + JOURS_CALENDRIER - 1);

  const priced = await pricelabsGetPrices(
    resolved.map((r) => ({ id: r.listing.id, pms: r.listing.pms })),
    dateISO(from),
    dateISO(to)
  );
  const pricedByListingId = new Map(priced.map((p) => [p.id, p]));

  for (const r of resolved) {
    const result = pricedByListingId.get(r.listing.id);
    if (!result || result.error) {
      await db
        .insert(pricelabsPriceCache)
        .values({ villaId: r.villaId, lastError: result?.error ?? "Réponse PriceLabs vide", syncedAt: new Date() })
        .onConflictDoUpdate({
          target: pricelabsPriceCache.villaId,
          set: { lastError: result?.error ?? "Réponse PriceLabs vide", syncedAt: new Date() },
        });
      continue;
    }

    const days = (result.data ?? []).map((d: PricelabsDailyPrice) => ({
      date: d.date,
      price: d.price,
      unbookable: Boolean(d.unbookable),
    }));

    await db
      .insert(pricelabsPriceCache)
      .values({
        villaId: r.villaId,
        currency: result.currency ?? r.listing.currency ?? null,
        minPrice: r.listing.min != null ? String(r.listing.min) : null,
        basePrice: r.listing.base != null ? String(r.listing.base) : null,
        maxPrice: r.listing.max != null ? String(r.listing.max) : null,
        days,
        lastError: null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pricelabsPriceCache.villaId,
        set: {
          currency: result.currency ?? r.listing.currency ?? null,
          minPrice: r.listing.min != null ? String(r.listing.min) : null,
          basePrice: r.listing.base != null ? String(r.listing.base) : null,
          maxPrice: r.listing.max != null ? String(r.listing.max) : null,
          days,
          lastError: null,
          syncedAt: new Date(),
        },
      });
  }
}
