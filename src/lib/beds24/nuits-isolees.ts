import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, pricelabsPriceCache } from "@/db/schema";
import { nuitsMinManuelles } from "@/db/schema-nuits-isolees";
import { beds24AlertesEcriture, beds24GetCalendars, beds24UpdateCalendar, type Beds24CalendarDay, type Beds24CalendarWrite } from "./client";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";
import { journaliser, type Auteur } from "@/lib/journal";
import { ajouterJours, jjmm, nuitsMinHabituel, nuitsMinVoulues, plages } from "./nuits-isolees-detection";
import { pricelabsGetListings, pricelabsGetPrices } from "@/lib/pricelabs/client";
import { annoncesCandidates, choisirAnnonce } from "@/lib/pricelabs/annonce";

// Nuits isolées ("nuits orphelines") — Fouad, 2026-10-20 : "si le système détecte qu'il y a une
// nuit isolée alors que la condition était deux nuits minimum, il doit débloquer le calendrier
// pour qu'on puisse quand même réserver cette nuit-là".
//
// Une nuit isolée = un écart de nuits libres coincé entre deux nuits indisponibles (séjour,
// blocage propriétaire, fermeture...) et plus court que le séjour minimum : avec "2 nuits min.",
// une nuit libre entre deux réservations n'est réservable par personne. On abaisse alors le
// séjour minimum de ces nuits à la longueur de l'écart (1 nuit), directement dans Beds24, donc sur
// Airbnb et Booking.com.
//
// Garde-fous :
// - on ne touche QUE le séjour minimum (minStay) : jamais numAvail ni les fermetures ("Remplacer"
//   / blackout), qui restent volontaires (consigne du 19/10/2026 : ne jamais rouvrir de dates) ;
// - une nuit dont l'arrivée est interdite (noCheckIn) est seulement signalée, pas modifiée ;
// - fonctionnement déclaratif : à chaque passage, l'app recalcule la valeur voulue de chaque date
//   (voir nuitsMinVoulues) et corrige seulement les écarts ; quand une nuit n'est plus isolée
//   (réservation voisine annulée), elle repasse d'elle-même au séjour minimum normal.
//
// Le séjour minimum "normal" vient de PriceLabs (profil "Min 2 nuits" + règle des nuitées
// orphelines ajoutée le 20/10/2026), à défaut 2 nuits. Le plancher de la chambre dans Beds24 doit
// être à 1, sinon Beds24 ignore toute valeur plus basse (rapport.plancherBloquant).

// 18 mois de calendrier gérés (lus par tranches de 180 jours).
export const JOURS_ANALYSE = 540;
const TRANCHE_JOURS = 180;

export const AUTEUR_NUITS_ISOLEES: Auteur = { type: "systeme", id: null, nom: "Nuits isolées (automatique)", email: null };

export type StatutNuitIsolee =
  | "reservable" // le séjour minimum permet déjà de réserver l'écart (PriceLabs ou réglage manuel)
  | "debloquee" // séjour minimum abaissé par l'app (ce passage ou un précédent)
  | "a_debloquer" // séjour minimum trop long : personne ne peut réserver l'écart
  | "arrivee_bloquee" // arrivée interdite ce jour-là (ou départ interdit le lendemain) : laissé tel quel
  | "echec"; // écriture Beds24 refusée ou non confirmée

export type NuitIsolee = {
  debut: string; // première nuit libre (YYYY-MM-DD)
  nuits: number; // longueur de l'écart
  dates: string[];
  minStay: number | null; // séjour minimum Beds24 actuel sur la première nuit
  minStayAvant: number | null; // séjour minimum normal de la date (manuel, PriceLabs ou 2)
  minStayPricelabs: number | null; // séjour minimum calculé par PriceLabs pour cette date
  statut: StatutNuitIsolee;
  detail?: string;
};

export type LogementNuitsIsolees = {
  villaId: string;
  villaNom: string;
  roomId: number;
  nuitsMinHabituel: number | null;
  nuitsIsolees: NuitIsolee[];
};

export type RapportNuitsIsolees = {
  genereLe: string; // ISO
  appliquer: boolean;
  logements: LogementNuitsIsolees[];
  debloquees: number; // débloquées pendant CE passage
  aDebloquer: number;
  restaurees: number; // dates remises au séjour minimum normal pendant CE passage
  datesEcrites: number; // dates confirmées dans Beds24 pendant CE passage
  plancherBloquant: boolean; // le plancher "Séjour minimum" de la chambre Beds24 empêche de descendre
  erreur: string | null;
};

let tablesPretes: Promise<void> | null = null;

// Tables créées à la volée (pas de migration à lancer sur Neon). nuit_isolee_deblocage n'est plus
// utilisée depuis que l'app gère toutes les nuits minimum, mais reste en base (historique).
function assurerTablesNuitsMin(): Promise<void> {
  if (!tablesPretes) {
    tablesPretes = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS nuits_min_manuelles (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          villa_id uuid NOT NULL,
          room_id integer NOT NULL,
          date text NOT NULL,
          min_stay integer NOT NULL,
          auteur_nom text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS nuits_min_manuelles_room_date_idx ON nuits_min_manuelles (room_id, date)`);
    })().catch((err) => {
      tablesPretes = null;
      throw err;
    });
  }
  return tablesPretes;
}

// Lecture Beds24 par tranches (la fenêtre fait 18 mois) puis fusion par logement.
async function lireCalendriers(roomIds: number[], debut: string, fin: string): Promise<Map<number, Beds24CalendarDay[]>> {
  const out = new Map<number, Beds24CalendarDay[]>(roomIds.map((id) => [id, []]));
  for (let d = debut; d <= fin; d = ajouterJours(d, TRANCHE_JOURS)) {
    const finTranche = ajouterJours(d, TRANCHE_JOURS - 1) < fin ? ajouterJours(d, TRANCHE_JOURS - 1) : fin;
    const tranche = await beds24GetCalendars(roomIds, d, finTranche);
    for (const [id, jours] of tranche) out.get(id)?.push(...jours);
  }
  return out;
}

// Séjour minimum calculé par PriceLabs pour chaque date (frais, en un seul appel), avec repli sur
// le cache de l'onglet Tarification si PriceLabs ne répond pas.
async function nuitsMinPricelabs(
  lignes: { id: string; candidates: string[]; cacheDays: unknown }[],
  debut: string,
  fin: string,
  frais: boolean
): Promise<Map<string, Map<string, number | null>>> {
  const parVilla = new Map<string, Map<string, number | null>>();
  for (const l of lignes) {
    parVilla.set(l.id, new Map(((l.cacheDays as { date: string; minStay?: number | null }[] | null) ?? []).map((d) => [d.date, d.minStay ?? null])));
  }
  // Rapport affiché à l'ouverture du planning : le cache suffit (pas d'appel PriceLabs à chaque
  // affichage). Les écritures (cron, webhook, bouton) utilisent toujours des valeurs fraîches.
  if (!frais) return parVilla;
  try {
    const listingById = new Map((await pricelabsGetListings()).map((x) => [x.id, x]));
    const cibles = lignes
      .map((l) => ({ villaId: l.id, listing: choisirAnnonce(l.candidates, listingById) }))
      .filter((c): c is { villaId: string; listing: NonNullable<typeof c.listing> } => Boolean(c.listing));
    if (cibles.length === 0) return parVilla;
    const finPricelabs = ajouterJours(debut, 364) < fin ? ajouterJours(debut, 364) : fin;
    const prix = await pricelabsGetPrices(cibles.map((c) => ({ id: c.listing.id, pms: c.listing.pms })), debut, finPricelabs);
    const parListing = new Map(prix.map((p) => [p.id, p]));
    for (const c of cibles) {
      const r = parListing.get(c.listing.id);
      if (!r || r.error || !r.data?.length) continue;
      parVilla.set(c.villaId, new Map(r.data.map((d) => [d.date, typeof d.min_stay === "number" && d.min_stay > 0 ? d.min_stay : null])));
    }
  } catch (err) {
    console.error("[nuits-min] PriceLabs indisponible, repli sur le cache :", err instanceof Error ? err.message : err);
  }
  return parVilla;
}

// Nuits minimum gérées par l'app (Fouad, 2026-10-20, option 1 : "plancher à 1 et l'app gère").
// Le séjour minimum de la chambre dans Beds24 est un PLANCHER que rien ne peut abaisser (ni
// PriceLabs, ni l'API, ni une saisie à la main) : avec 2 au niveau chambre, une nuit isolée reste
// à 2 nuits. On passe donc ce plancher à 1 et c'est l'app qui écrit, jour par jour sur 18 mois,
// le séjour minimum voulu (voir nuitsMinVoulues : manuel > nuit isolée > PriceLabs > 2).
//
// appliquer=false : rapport seul. appliquer=true : écrit les seules dates dont la valeur Beds24
// diffère de la valeur voulue (cron, webhook). forcer=true : réécrit TOUTES les dates (bouton de
// la vue planning, et première mise en place avant d'abaisser le plancher). Jamais d'exception.
export async function analyserNuitsIsolees(options: { appliquer: boolean; forcer?: boolean; auteur?: Auteur; villaIds?: string[] }): Promise<RapportNuitsIsolees> {
  const rapport: RapportNuitsIsolees = {
    genereLe: new Date().toISOString(),
    appliquer: options.appliquer,
    logements: [],
    debloquees: 0,
    aDebloquer: 0,
    restaurees: 0,
    datesEcrites: 0,
    plancherBloquant: false,
    erreur: null,
  };

  try {
    const db = getDb();
    const aujourdhui = nowInMorocco().toISOString().slice(0, 10);
    const fin = ajouterJours(aujourdhui, JOURS_ANALYSE - 1);

    const lignes = (
      await db
        .select({
          id: villas.id,
          nom: villas.nom,
          beds24RoomId: villas.beds24RoomId,
          beds24PropertyId: villas.beds24PropertyId,
          pricelabsListingId: villas.pricelabsListingId,
          cacheDays: pricelabsPriceCache.days,
        })
        .from(villas)
        .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
        .where(and(isNotNull(villas.beds24RoomId), options.villaIds?.length ? inArray(villas.id, options.villaIds) : undefined))
    )
      .filter((v) => villaEstGeree(v.nom))
      .map((v) => ({ ...v, roomId: Number(v.beds24RoomId), candidates: annoncesCandidates(v) }))
      .filter((v) => Number.isInteger(v.roomId) && v.roomId > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    if (lignes.length === 0) return rapport;

    await assurerTablesNuitsMin();
    if (options.appliquer) await db.delete(nuitsMinManuelles).where(lt(nuitsMinManuelles.date, aujourdhui));
    const manuelles = await db
      .select({ roomId: nuitsMinManuelles.roomId, date: nuitsMinManuelles.date, minStay: nuitsMinManuelles.minStay })
      .from(nuitsMinManuelles)
      .where(inArray(nuitsMinManuelles.roomId, lignes.map((l) => l.roomId)));

    const [calendriers, pricelabs] = await Promise.all([
      lireCalendriers(lignes.map((l) => l.roomId), aujourdhui, fin),
      nuitsMinPricelabs(lignes, aujourdhui, fin, options.appliquer),
    ]);

    const ecritures = new Map<number, { date: string; minStay: number }[]>();
    const changements = new Map<number, { baisses: string[]; hausses: string[] }>();

    for (const l of lignes) {
      const jours = calendriers.get(l.roomId) ?? [];
      const actuel = new Map(jours.map((j) => [j.date, j.minStay]));
      const { voulu, ecarts } = nuitsMinVoulues({
        jours,
        debut: aujourdhui,
        fin,
        pricelabs: pricelabs.get(l.id) ?? new Map(),
        manuelles: new Map(manuelles.filter((m) => m.roomId === l.roomId).map((m) => [m.date, m.minStay])),
      });

      const logement: LogementNuitsIsolees = { villaId: l.id, villaNom: l.nom, roomId: l.roomId, nuitsMinHabituel: nuitsMinHabituel(jours), nuitsIsolees: [] };
      for (const e of ecarts) {
        const minStay = actuel.get(e.debut) ?? null;
        const cible = voulu.get(e.debut)?.minStay ?? e.base;
        const nuit: NuitIsolee = {
          debut: e.debut,
          nuits: e.nuits,
          dates: e.dates,
          minStay,
          minStayAvant: e.base,
          minStayPricelabs: pricelabs.get(l.id)?.get(e.debut) ?? null,
          statut: "reservable",
        };
        if (e.arriveeInterdite || e.departInterdit) {
          nuit.statut = "arrivee_bloquee";
          nuit.detail = e.arriveeInterdite ? "Arrivée interdite ce jour-là dans Beds24 (laissé tel quel)." : "Départ interdit le lendemain dans Beds24 (laissé tel quel).";
        } else if (voulu.get(e.debut)?.source === "manuel" && cible > e.nuits) {
          nuit.statut = "arrivee_bloquee";
          nuit.detail = `Nuits minimum fixées à la main à ${cible} : laissé tel quel.`;
        } else if (minStay != null && minStay > e.nuits) {
          nuit.statut = "a_debloquer";
          rapport.aDebloquer++;
        } else {
          nuit.statut = "debloquee";
        }
        logement.nuitsIsolees.push(nuit);
      }
      rapport.logements.push(logement);

      if (!options.appliquer) continue;
      const liste: { date: string; minStay: number }[] = [];
      const ch = { baisses: [] as string[], hausses: [] as string[] };
      for (const [date, v] of voulu) {
        const a = actuel.get(date) ?? null;
        if (!options.forcer && a === v.minStay) continue;
        liste.push({ date, minStay: v.minStay });
        if (a != null && v.minStay < a) ch.baisses.push(date);
        else if (a != null && v.minStay > a) ch.hausses.push(date);
      }
      if (liste.length > 0) ecritures.set(l.roomId, liste);
      changements.set(l.roomId, ch);
    }

    if (!options.appliquer || ecritures.size === 0) return rapport;

    const envoi: Beds24CalendarWrite[] = [...ecritures.entries()].map(([roomId, valeurs]) => ({ roomId, calendar: plages(valeurs) }));
    let erreurEcriture: string | null = null;
    let alerteBeds24: string | null = null;
    try {
      alerteBeds24 = beds24AlertesEcriture(await beds24UpdateCalendar(envoi));
    } catch (err) {
      erreurEcriture = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }
    if (alerteBeds24) console.warn("[nuits-min] réponse Beds24 :", alerteBeds24);

    // Relecture de contrôle sur les dates écrites.
    const toutes = [...ecritures.values()].flat().map((v) => v.date);
    const premiere = toutes.reduce((a, b) => (a < b ? a : b));
    const derniere = toutes.reduce((a, b) => (a > b ? a : b));
    let relu = erreurEcriture ? new Map<number, Beds24CalendarDay[]>() : await lireCalendriers([...ecritures.keys()], premiere, derniere).catch(() => new Map<number, Beds24CalendarDay[]>());
    const valeurRelue = (roomId: number, date: string) => relu.get(roomId)?.find((j) => j.date === date)?.minStay ?? null;
    const nonConfirmees = () => [...ecritures.entries()].flatMap(([roomId, vs]) => vs.filter((v) => valeurRelue(roomId, v.date) !== v.minStay).map((v) => ({ roomId, ...v })));
    if (!erreurEcriture && nonConfirmees().length > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      relu = await lireCalendriers([...ecritures.keys()], premiere, derniere).catch(() => new Map<number, Beds24CalendarDay[]>());
    }
    const echecs = erreurEcriture ? [...ecritures.entries()].flatMap(([roomId, vs]) => vs.map((v) => ({ roomId, ...v }))) : nonConfirmees();
    // Valeur plus basse refusée alors que Beds24 renvoie toujours plus haut : c'est le plancher de
    // la chambre (Paramètres > Chambres > Règles > Séjour minimum) qui bloque.
    rapport.plancherBloquant = !erreurEcriture && echecs.some((e) => (valeurRelue(e.roomId, e.date) ?? 0) > e.minStay);
    const cleEchec = new Set(echecs.map((e) => `${e.roomId}:${e.date}`));
    rapport.datesEcrites = [...ecritures.values()].reduce((s, vs) => s + vs.length, 0) - echecs.length;

    const auteur = options.auteur ?? AUTEUR_NUITS_ISOLEES;
    for (const logement of rapport.logements) {
      const ch = changements.get(logement.roomId);
      const debloquees: string[] = [];
      const enEchec: string[] = [];
      for (const nuit of logement.nuitsIsolees) {
        if (nuit.statut !== "a_debloquer") continue;
        if (nuit.dates.some((d) => cleEchec.has(`${logement.roomId}:${d}`))) {
          nuit.statut = "echec";
          nuit.detail = rapport.plancherBloquant
            ? "Beds24 garde le séjour minimum de la chambre (plancher) : à passer à 1 dans Beds24."
            : (erreurEcriture ?? alerteBeds24 ?? "Beds24 n'a pas confirmé le nouveau séjour minimum.");
          enEchec.push(jjmm(nuit.debut));
        } else {
          nuit.minStay = valeurRelue(logement.roomId, nuit.debut) ?? nuit.nuits;
          nuit.statut = "debloquee";
          rapport.debloquees++;
          rapport.aDebloquer--;
          debloquees.push(`${jjmm(nuit.debut)} (${nuit.minStayAvant} → ${nuit.nuits} nuit${nuit.nuits > 1 ? "s" : ""} min.)`);
        }
      }
      const hausses = (ch?.hausses ?? []).filter((d) => !cleEchec.has(`${logement.roomId}:${d}`)).length;
      if (hausses > 0) rapport.restaurees += hausses;
      if (debloquees.length > 0 || enEchec.length > 0) {
        await journaliser({
          action: "nuit_isolee_debloquee",
          categorie: "calendrier",
          libelle: enEchec.length > 0 && debloquees.length === 0 ? "Échec du déblocage d'une nuit isolée" : "Nuit isolée débloquée",
          villaId: logement.villaId,
          villaNom: logement.villaNom,
          resume: [debloquees.length ? `Nuits isolées débloquées : ${debloquees.join(", ")}` : null, enEchec.length ? `Échec : ${enEchec.join(", ")}` : null]
            .filter(Boolean)
            .join(" · "),
          auteur,
          beds24Statut: enEchec.length > 0 ? "echec" : "ok",
          beds24Detail: enEchec.length > 0 ? (rapport.plancherBloquant ? "Plancher de la chambre dans Beds24" : (erreurEcriture ?? "Non confirmé par Beds24")) : "Séjour minimum abaissé dans Beds24 (Airbnb + Booking.com).",
        });
      }
      if (hausses > 0 && !options.forcer) {
        await journaliser({
          action: "nuits_min_remises",
          categorie: "calendrier",
          libelle: "Nuits minimum remises",
          villaId: logement.villaId,
          villaNom: logement.villaNom,
          resume: `${hausses} date${hausses > 1 ? "s" : ""} remise${hausses > 1 ? "s" : ""} au séjour minimum normal (PriceLabs ou 2 nuits).`,
          auteur,
          beds24Statut: "ok",
        });
      }
    }
    if (options.forcer) {
      await journaliser({
        action: "nuits_min_reecrites",
        categorie: "calendrier",
        libelle: "Nuits minimum réécrites dans Beds24",
        resume: `${rapport.datesEcrites} dates sur ${ecritures.size} logement${ecritures.size > 1 ? "s" : ""} (18 mois)${echecs.length ? ` · ${echecs.length} non confirmées` : ""}`,
        auteur,
        beds24Statut: echecs.length > 0 ? "echec" : "ok",
      });
    }
    if (erreurEcriture) rapport.erreur = `Beds24 a refusé la mise à jour : ${erreurEcriture}`;
  } catch (err) {
    console.error("[nuits-min]", err);
    rapport.erreur = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }
  return rapport;
}

// Valeurs fixées à la main dans le panneau de la vue planning : enregistrées pour que la
// synchro ne les remplace jamais par la valeur PriceLabs (qui ne tient compte d'une dérogation
// qu'à son prochain recalcul, jusqu'à 24 h plus tard).
export async function enregistrerNuitsMinManuelles(
  lignes: { villaId: string; roomId: number }[],
  dates: string[],
  minStay: number,
  auteurNom: string | null
): Promise<void> {
  if (lignes.length === 0 || dates.length === 0) return;
  await assurerTablesNuitsMin();
  const valeurs = lignes.flatMap((l) => dates.map((date) => ({ villaId: l.villaId, roomId: l.roomId, date, minStay, auteurNom })));
  for (let i = 0; i < valeurs.length; i += 500) {
    await getDb()
      .insert(nuitsMinManuelles)
      .values(valeurs.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [nuitsMinManuelles.roomId, nuitsMinManuelles.date],
        set: { minStay: sql`excluded.min_stay`, auteurNom: sql`excluded.auteur_nom`, createdAt: sql`now()` },
      });
  }
}
