import { and, eq, gt, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, pricelabsPriceCache, reservations } from "@/db/schema";
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

export type TarificationReservation = {
  guestName: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  montant: number | null;
  devise: string;
  enCours: boolean; // aujourd'hui tombe dans [checkIn, checkOut)
};

export type TarificationVilla = {
  id: string;
  nom: string;
  numero: string;
  type: "villa" | "appartement";
  domaineNom: string | null;
  photoUrl: string | null;
  currency: string | null;
  minPrice: number | null;
  basePrice: number | null;
  maxPrice: number | null;
  days: { date: string; price: number | null; unbookable: boolean }[];
  reservations: TarificationReservation[];
  syncedAt: string | null;
  error: string | null;
};

// Récupère les prix de toutes les villas reliées à PriceLabs, en resynchronisant celles dont le
// cache a dépassé PRICELABS_CACHE_TTL_HOURS (par défaut 2h) — ou toutes si force=true (bouton
// "Actualiser les prix"). Ne renvoie jamais la clé API : seules les données déjà nettoyées par
// le client PriceLabs transitent par ici.
export async function getTarification(options: { force?: boolean } = {}): Promise<TarificationVilla[]> {
  const db = getDb();

  // Villas ET appartements : toute fiche reliée à PriceLabs (pricelabsListingId renseigné)
  // apparaît, y compris celles d'un domaine masqué ailleurs dans l'app (ex. Noria, mis de côté
  // opérationnellement) — la tarification reste utile même pour des logements pas gérés au
  // jour le jour. Le vrai filtre ici est le mapping PriceLabs lui-même, posé à la main par
  // Kamel : rien ne s'affiche tant qu'il n'a pas relié la fiche.
  const rows = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
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
    .where(isNotNull(villas.pricelabsListingId));

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
  const resaParVilla = await reservationsActivesParVilla(freshRows.map((v) => v.id));

  return freshRows.map((v) => {
    const resaVilla = resaParVilla.get(v.id) ?? [];
    const occupe = new Set(resaVilla.flatMap((r) => datesEntre(r.checkIn, r.checkOut)));
    const days = ((v.cacheDays as TarificationVilla["days"] | null) ?? []).map((d) => ({
      ...d,
      unbookable: d.unbookable || occupe.has(d.date),
    }));
    return {
      id: v.id,
      nom: v.nom,
      numero: v.numero,
      type: v.type,
      domaineNom: v.domaineNom,
      photoUrl: v.photoUrl,
      currency: v.cacheCurrency,
      minPrice: v.cacheMinPrice ? Number(v.cacheMinPrice) : null,
      basePrice: v.cacheBasePrice ? Number(v.cacheBasePrice) : null,
      maxPrice: v.cacheMaxPrice ? Number(v.cacheMaxPrice) : null,
      days,
      reservations: resaVilla,
      syncedAt: v.cacheSyncedAt ? v.cacheSyncedAt.toISOString() : null,
      error: v.cacheLastError,
    };
  });
}

function datesEntre(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  for (const cursor = new Date(`${checkIn}T00:00:00Z`); cursor < new Date(`${checkOut}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

// PriceLabs ne reflète que ce que SA propre connexion au canal (Airbnb...) lui a remonté, qui
// peut avoir du retard sur une vraie réservation déjà enregistrée dans l'app (via Superhote/iCal,
// ou saisie manuelle) — vu en pratique le 2026-09-26 : Villa Tania affichée "Disponible ce soir"
// alors qu'un client (Youness, résa Superhote/Airbnb) y était déjà. `reservations` est la source
// de vérité utilisée partout ailleurs dans l'app (dashboard, planning...) : on la superpose
// toujours par-dessus le calendrier PriceLabs, même quand le prix vient du cache — et sert aussi
// à dessiner les barres de réservation façon calendrier hôte Airbnb (nom du client + montant).
async function reservationsActivesParVilla(villaIds: string[]): Promise<Map<string, TarificationReservation[]>> {
  const parVilla = new Map<string, TarificationReservation[]>();
  if (villaIds.length === 0) return parVilla;

  const db = getDb();
  const debutFenetre = new Date();
  debutFenetre.setUTCHours(0, 0, 0, 0);
  const finFenetre = new Date(debutFenetre);
  finFenetre.setUTCDate(finFenetre.getUTCDate() + JOURS_CALENDRIER);
  const aujourdhui = dateISO(debutFenetre);

  const rows = await db
    .select({
      villaId: reservations.villaId,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      loyerTotal: reservations.loyerTotal,
      devisePaiement: reservations.devisePaiement,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.villaId, villaIds),
        ne(reservations.status, "annulee"),
        gt(reservations.checkOut, debutFenetre),
        lt(reservations.checkIn, finFenetre)
      )
    );

  for (const r of rows) {
    if (!r.villaId) continue;
    const checkIn = dateISO(new Date(r.checkIn));
    const checkOut = dateISO(new Date(r.checkOut));
    const list = parVilla.get(r.villaId) ?? [];
    list.push({
      guestName: r.guestName,
      checkIn,
      checkOut,
      montant: r.loyerTotal ? Number(r.loyerTotal) : null,
      devise: r.devisePaiement,
      enCours: checkIn <= aujourdhui && aujourdhui < checkOut,
    });
    parVilla.set(r.villaId, list);
  }

  return parVilla;
}

async function reloadCache(villaIds: string[]) {
  const db = getDb();
  const rows = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
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
