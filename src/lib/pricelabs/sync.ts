import { and, eq, gt, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, pricelabsPriceCache, reservations } from "@/db/schema";
import { pricelabsGetListings, pricelabsGetPrices, PricelabsConfigError, type PricelabsDailyPrice } from "./client";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { estDirham, getMadParEur, madVersEur } from "@/lib/devises";
import { annoncesCandidates, choisirAnnonce } from "./annonce";
import { creationsParReservation } from "@/lib/journal";

// PriceLabs calcule des prix fiables sur un an complet (vérifié : 365/365 jours non-null pour
// Villa Tania le 2026-09-28), donc l'onglet Tarification peut proposer un vrai sélecteur de mois
// façon Airbnb (juillet 2026 → octobre 2027 sur la capture de référence) plutôt que se limiter
// aux ~2 mois d'une fenêtre de 60 jours.
const JOURS_CALENDRIER = 365;

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
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestsCount: number | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  montant: number | null;
  montantPaye: number | null;
  devise: string;
  canal: string | null;
  source: string; // origine : "manuel" (créée dans l'app, supprimable), "beds24", "superhote"...
  notes: string | null;
  enCours: boolean; // aujourd'hui tombe dans [checkIn, checkOut)
  // Journal "qui a fait quoi" (voir src/lib/journal.ts) : quand la réservation a été ajoutée
  // dans l'app (instant réel ISO), par qui (null si avant la mise en place du journal, le
  // 16/10/2026) et si la fermeture des dates sur Beds24 a échoué à la création.
  ajouteeLe?: string | null;
  ajouteePar?: string | null;
  beds24Echec?: boolean;
};

export type TarificationVilla = {
  id: string;
  nom: string;
  numero: string;
  type: "villa" | "appartement";
  domaineNom: string | null;
  photoUrl: string | null;
  beds24RoomId: string | null;
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
  const rows = (
    await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
      photoUrl: villas.photoUrl,
      beds24RoomId: villas.beds24RoomId,
      beds24PropertyId: villas.beds24PropertyId,
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
    .where(or(isNotNull(villas.pricelabsListingId), isNotNull(villas.beds24RoomId)))
  )
    .filter((v) => villaEstGeree(v.nom)) // logements retirés (voir VILLAS_MASQUEES) : hors calendrier
    .map((v) => ({ ...v, candidates: annoncesCandidates(v) }))
    .filter((v) => v.candidates.length > 0);

  const staleVillas = rows.filter((v) => options.force || estPerimee(v.cacheSyncedAt));

  if (staleVillas.length > 0) {
    try {
      await resyncVillas(staleVillas.map((v) => ({ id: v.id, candidates: v.candidates })));
    } catch (err) {
      // Panne PriceLabs (clé absente, API down, quota dépassé...) : on n'écrase rien en base,
      // les villas déjà en cache continuent d'afficher leurs derniers prix connus, et celles
      // jamais synchronisées ressortiront avec error ci-dessous.
      console.error("[pricelabs] échec de synchro globale", err instanceof PricelabsConfigError ? err.message : err);
    }
  }

  const freshRows = staleVillas.length > 0 ? await reloadCache(rows.map((v) => v.id)) : rows;
  const resaParVilla = await reservationsActivesParVilla(freshRows.map((v) => v.id));
  // Annonce PriceLabs en dirhams (Villa Wimiliim) : prix convertis en euros comme toutes les
  // autres villas, pour ne plus afficher "2894MAD" à côté de "333€" dans la grille.
  const madParEur = freshRows.some((v) => estDirham(v.cacheCurrency)) ? await getMadParEur() : null;

  return freshRows.map((v) => {
    const resaVilla = resaParVilla.get(v.id) ?? [];
    const occupe = new Set(resaVilla.flatMap((r) => datesEntre(r.checkIn, r.checkOut)));
    const taux = madParEur != null && estDirham(v.cacheCurrency) ? madParEur : null;
    const enDirhams = taux != null;
    const prix = (p: number | null | undefined): number | null =>
      p == null ? null : taux != null ? madVersEur(Number(p), taux) : Number(p);
    const days = ((v.cacheDays as TarificationVilla["days"] | null) ?? []).map((d) => ({
      ...d,
      price: prix(d.price),
      unbookable: d.unbookable || occupe.has(d.date),
    }));
    return {
      id: v.id,
      nom: v.nom,
      numero: v.numero,
      type: v.type,
      domaineNom: v.domaineNom,
      photoUrl: v.photoUrl,
      beds24RoomId: v.beds24RoomId,
      currency: enDirhams ? "EUR" : v.cacheCurrency,
      minPrice: v.cacheMinPrice ? prix(Number(v.cacheMinPrice)) : null,
      basePrice: v.cacheBasePrice ? prix(Number(v.cacheBasePrice)) : null,
      maxPrice: v.cacheMaxPrice ? prix(Number(v.cacheMaxPrice)) : null,
      days,
      reservations: resaVilla,
      syncedAt: v.cacheSyncedAt ? v.cacheSyncedAt.toISOString() : null,
      error: v.cacheLastError,
    };
  });
}

// Annonce PriceLabs d'une fiche : voir lib/pricelabs/annonce.ts (annonce Beds24 en priorité,
// annonce reliée à la main en secours). Fouad, 2026-10-14 : Villa Lila et Villa Nessya, reliées à
// Beds24 mais jamais à PriceLabs dans l'app, n'apparaissaient pas dans le calendrier planning.

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
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const aujourdhui = dateISO(debutJour);
  // Quelques jours de passé en plus, comme la vue planning SuperHote v2 qui affiche les séjours
  // tout juste terminés (grisés) avant aujourd'hui — voir JOURS_PASSES_PLANNING dans
  // tarification-view.tsx. Sans effet sur le calcul des jours occupés : le cache PriceLabs ne
  // contient que des dates à partir d'aujourd'hui.
  const debutFenetre = new Date(debutJour);
  debutFenetre.setUTCDate(debutFenetre.getUTCDate() - 7);
  const finFenetre = new Date(debutJour);
  finFenetre.setUTCDate(finFenetre.getUTCDate() + JOURS_CALENDRIER);

  const rows = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      guestsCount: reservations.guestsCount,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      devisePaiement: reservations.devisePaiement,
      canal: reservations.canal,
      source: reservations.source,
      notes: reservations.notes,
      createdAt: reservations.createdAt,
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

  const creations = await creationsParReservation(rows.map((r) => r.id));

  for (const r of rows) {
    if (!r.villaId) continue;
    const creation = creations.get(r.id);
    const checkIn = dateISO(new Date(r.checkIn));
    const checkOut = dateISO(new Date(r.checkOut));
    const list = parVilla.get(r.villaId) ?? [];
    list.push({
      id: r.id,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestsCount: r.guestsCount,
      checkIn,
      checkOut,
      montant: r.loyerTotal ? Number(r.loyerTotal) : null,
      montantPaye: r.montantPaye ? Number(r.montantPaye) : null,
      devise: r.devisePaiement,
      canal: r.canal,
      source: r.source,
      notes: r.notes,
      enCours: checkIn <= aujourdhui && aujourdhui < checkOut,
      ajouteeLe: creation?.createdAt ?? (r.createdAt ? new Date(r.createdAt).toISOString() : null),
      ajouteePar: creation?.auteurNom ?? null,
      beds24Echec: creation?.beds24Statut === "echec",
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
      beds24RoomId: villas.beds24RoomId,
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

async function resyncVillas(targets: { id: string; candidates: string[] }[]) {
  const db = getDb();
  const listings = await pricelabsGetListings();
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const resolved = targets
    .map((t) => ({ villaId: t.id, listing: choisirAnnonce(t.candidates, listingById) }))
    .filter((t): t is { villaId: string; listing: NonNullable<typeof t.listing> } => Boolean(t.listing));

  const introuvables = targets.filter((t) => !choisirAnnonce(t.candidates, listingById));
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
