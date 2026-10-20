import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, pricelabsPriceCache } from "@/db/schema";
import { nuitsIsoleesDeblocages } from "@/db/schema-nuits-isolees";
import { beds24GetCalendars, beds24UpdateCalendar, type Beds24CalendarDay, type Beds24CalendarWrite } from "./client";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";
import { journaliser, type Auteur } from "@/lib/journal";
import { ajouterJours, ecartsLibres, jjmm, nuitLibre, nuitsMinHabituel, plages } from "./nuits-isolees-detection";

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
// - chaque déblocage est noté (table nuit_isolee_deblocage) avec la valeur d'avant, remise dès
//   que la nuit n'est plus isolée — sauf si PriceLabs ou quelqu'un l'a changée entre-temps.
//
// Depuis le 20/10/2026, le profil PriceLabs "Min 2 nuits" contient aussi la règle "nuitées
// orphelines → séjour min. = longueur de l'écart" : PriceLabs pousse donc déjà 1 nuit sur ces
// dates à chaque synchro. Ce module reste le filet de sécurité immédiat (webhook à chaque
// réservation) et le rapport affiché dans la vue planning.

export const JOURS_ANALYSE = 365;

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
  minStayAvant: number | null; // valeur remplacée par l'app (déblocage de ce passage ou précédent)
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
  restaurees: number;
  erreur: string | null;
};

let tablePrete: Promise<void> | null = null;

function assurerTableNuitsIsolees(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS nuit_isolee_deblocage (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          villa_id uuid NOT NULL,
          villa_nom text,
          room_id integer NOT NULL,
          date text NOT NULL,
          min_stay_avant integer NOT NULL,
          min_stay_apres integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          terminee_le timestamptz,
          issue text
        )
      `);
      await db.execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS nuit_isolee_deblocage_actif_idx ON nuit_isolee_deblocage (room_id, date) WHERE terminee_le IS NULL`
      );
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

// Appelé quand quelqu'un fixe lui-même les nuits minimum de ces dates (panneau de la vue
// planning) : l'app ne doit plus jamais "remettre" sa valeur d'avant par-dessus ce choix.
export async function terminerDeblocagesManuels(roomId: number, dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  try {
    await assurerTableNuitsIsolees();
    await getDb()
      .update(nuitsIsoleesDeblocages)
      .set({ termineeLe: new Date(), issue: "manuel" })
      .where(and(eq(nuitsIsoleesDeblocages.roomId, roomId), inArray(nuitsIsoleesDeblocages.date, dates), isNull(nuitsIsoleesDeblocages.termineeLe)));
  } catch (err) {
    console.error("[nuits-isolees] clôture manuelle impossible", err);
  }
}

// Analyse tout le parc relié à Beds24. appliquer=false : rapport seul (aucune écriture).
// appliquer=true : débloque les nuits isolées et remet les nuits min. des anciennes nuits isolées
// qui ne le sont plus. Ne lève jamais d'exception : l'erreur éventuelle est dans `erreur`.
export async function analyserNuitsIsolees(options: { appliquer: boolean; auteur?: Auteur; villaIds?: string[] }): Promise<RapportNuitsIsolees> {
  const rapport: RapportNuitsIsolees = {
    genereLe: new Date().toISOString(),
    appliquer: options.appliquer,
    logements: [],
    debloquees: 0,
    aDebloquer: 0,
    restaurees: 0,
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
          cacheDays: pricelabsPriceCache.days,
        })
        .from(villas)
        .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
        .where(and(isNotNull(villas.beds24RoomId), options.villaIds?.length ? inArray(villas.id, options.villaIds) : undefined))
    )
      .filter((v) => villaEstGeree(v.nom))
      .map((v) => ({ ...v, roomId: Number(v.beds24RoomId) }))
      .filter((v) => Number.isInteger(v.roomId) && v.roomId > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    if (lignes.length === 0) return rapport;

    await assurerTableNuitsIsolees();
    const actifs = await db
      .select()
      .from(nuitsIsoleesDeblocages)
      .where(and(isNull(nuitsIsoleesDeblocages.termineeLe), inArray(nuitsIsoleesDeblocages.roomId, lignes.map((l) => l.roomId))));
    const actifsParCle = new Map(actifs.map((a) => [`${a.roomId}:${a.date}`, a]));

    const calendriers = await beds24GetCalendars(lignes.map((l) => l.roomId), aujourdhui, fin);

    const ecritures = new Map<number, { date: string; minStay: number }[]>();
    const aEnregistrer: { villaId: string; villaNom: string; roomId: number; date: string; avant: number; apres: number }[] = [];
    const aRestaurer: (typeof actifs)[number][] = [];
    const aCloturer: { id: string; issue: string }[] = [];

    for (const l of lignes) {
      const jours = calendriers.get(l.roomId) ?? [];
      const parDate = new Map(jours.map((j) => [j.date, j]));
      const pricelabs = new Map(((l.cacheDays as { date: string; minStay?: number | null }[] | null) ?? []).map((d) => [d.date, d.minStay ?? null]));
      const habituel = nuitsMinHabituel(jours);
      const logement: LogementNuitsIsolees = { villaId: l.id, villaNom: l.nom, roomId: l.roomId, nuitsMinHabituel: habituel, nuitsIsolees: [] };
      const datesIsolees = new Set<string>();

      for (const ecart of ecartsLibres(jours, aujourdhui, fin)) {
        const premiere = parDate.get(ecart.debut);
        const minStay = premiere?.minStay ?? null;
        const nuits = ecart.dates.length;
        // Un écart n'est "isolé" que s'il est plus court que le séjour minimum habituel ou que
        // celui de sa première nuit (un écart de 3 nuits avec "2 nuits min." est réservable).
        // Un écart qui s'est agrandi (réservation voisine annulée) n'est plus isolé : ses nuits
        // débloquées seront remises plus bas.
        const seuil = Math.max(habituel ?? 0, minStay ?? 0);
        if (nuits >= seuil) continue;
        const dejaDebloquee = ecart.dates.some((d) => actifsParCle.has(`${l.roomId}:${d}`));
        for (const d of ecart.dates) datesIsolees.add(d);

        const lendemain = parDate.get(ajouterJours(ecart.dates[nuits - 1], 1));
        const departInterdit = lendemain?.override === "noCheckOut" || lendemain?.override === "noCheckInOrCheckOut";
        const arriveeInterdite = premiere?.override === "noCheckIn" || premiere?.override === "noCheckInOrCheckOut";
        const actif = actifsParCle.get(`${l.roomId}:${ecart.debut}`);

        const nuit: NuitIsolee = {
          debut: ecart.debut,
          nuits,
          dates: ecart.dates,
          minStay,
          minStayAvant: actif?.minStayAvant ?? null,
          minStayPricelabs: pricelabs.get(ecart.debut) ?? null,
          statut: "reservable",
        };

        if (arriveeInterdite || departInterdit) {
          nuit.statut = "arrivee_bloquee";
          nuit.detail = arriveeInterdite ? "Arrivée interdite ce jour-là dans Beds24 (laissé tel quel)." : "Départ interdit le lendemain dans Beds24 (laissé tel quel).";
        } else if (minStay != null && minStay > nuits) {
          nuit.statut = "a_debloquer";
          rapport.aDebloquer++;
          if (options.appliquer) {
            const liste = ecritures.get(l.roomId) ?? [];
            for (const d of ecart.dates) {
              const actuel = parDate.get(d)?.minStay ?? null;
              if (actuel == null || actuel <= nuits) continue;
              liste.push({ date: d, minStay: nuits });
              if (!actifsParCle.has(`${l.roomId}:${d}`)) {
                aEnregistrer.push({ villaId: l.id, villaNom: l.nom, roomId: l.roomId, date: d, avant: actuel, apres: nuits });
              }
            }
            ecritures.set(l.roomId, liste);
          }
        } else if (dejaDebloquee) {
          nuit.statut = "debloquee";
        }
        logement.nuitsIsolees.push(nuit);
      }

      // Anciennes nuits isolées débloquées par l'app : à remettre si elles ne le sont plus.
      for (const a of actifs.filter((x) => x.roomId === l.roomId)) {
        if (a.date < aujourdhui) {
          aCloturer.push({ id: a.id, issue: "passee" });
          continue;
        }
        if (datesIsolees.has(a.date)) continue; // toujours isolée : on garde
        const jour = parDate.get(a.date);
        const libre = nuitLibre(jour);
        if (libre === false) aCloturer.push({ id: a.id, issue: "reservee" });
        else if (libre === true && jour?.minStay === a.minStayApres) aRestaurer.push(a);
        else if (libre === true) aCloturer.push({ id: a.id, issue: "remplacee" });
        // libre === null : état inconnu, on retentera au prochain passage
      }

      rapport.logements.push(logement);
    }

    if (!options.appliquer) return rapport;

    // Restaurations ajoutées au même envoi Beds24 que les déblocages.
    for (const a of aRestaurer) {
      const liste = ecritures.get(a.roomId) ?? [];
      liste.push({ date: a.date, minStay: a.minStayAvant });
      ecritures.set(a.roomId, liste);
    }

    if (aCloturer.length > 0) {
      for (const c of aCloturer) {
        await db.update(nuitsIsoleesDeblocages).set({ termineeLe: new Date(), issue: c.issue }).where(eq(nuitsIsoleesDeblocages.id, c.id));
      }
    }

    const envoi: Beds24CalendarWrite[] = [...ecritures.entries()]
      .filter(([, valeurs]) => valeurs.length > 0)
      .map(([roomId, valeurs]) => ({ roomId, calendar: plages(valeurs) }));
    if (envoi.length === 0) return rapport;

    let erreurEcriture: string | null = null;
    try {
      await beds24UpdateCalendar(envoi);
    } catch (err) {
      erreurEcriture = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }

    // Relecture : on ne note "débloquée" que ce que Beds24 confirme réellement.
    const datesEcrites = envoi.flatMap((e) => e.calendar.map((c) => c.from)).concat(envoi.flatMap((e) => e.calendar.map((c) => c.to ?? c.from)));
    const relu = erreurEcriture
      ? new Map<number, Beds24CalendarDay[]>()
      : await beds24GetCalendars(envoi.map((e) => e.roomId), datesEcrites.reduce((a, b) => (a < b ? a : b)), datesEcrites.reduce((a, b) => (a > b ? a : b))).catch(
          () => new Map<number, Beds24CalendarDay[]>()
        );
    const confirme = (roomId: number, date: string, minStay: number) => relu.get(roomId)?.find((j) => j.date === date)?.minStay === minStay;

    for (const e of aEnregistrer) {
      if (!confirme(e.roomId, e.date, e.apres)) continue;
      await db
        .insert(nuitsIsoleesDeblocages)
        .values({ villaId: e.villaId, villaNom: e.villaNom, roomId: e.roomId, date: e.date, minStayAvant: e.avant, minStayApres: e.apres })
        .onConflictDoNothing();
    }
    for (const a of aRestaurer) {
      if (!confirme(a.roomId, a.date, a.minStayAvant)) continue;
      await db.update(nuitsIsoleesDeblocages).set({ termineeLe: new Date(), issue: "restauree" }).where(eq(nuitsIsoleesDeblocages.id, a.id));
      rapport.restaurees++;
    }

    // Statuts finaux + journal (une ligne par logement concerné).
    const auteur = options.auteur ?? AUTEUR_NUITS_ISOLEES;
    for (const logement of rapport.logements) {
      const debloquees: string[] = [];
      const echecs: string[] = [];
      for (const nuit of logement.nuitsIsolees) {
        if (nuit.statut !== "a_debloquer") continue;
        const ok = nuit.dates.every((d) => {
          const ecrite = ecritures.get(logement.roomId)?.find((v) => v.date === d);
          return !ecrite || confirme(logement.roomId, d, ecrite.minStay);
        });
        if (ok) {
          nuit.minStayAvant = nuit.minStay;
          nuit.minStay = nuit.nuits;
          nuit.statut = "debloquee";
          rapport.debloquees++;
          rapport.aDebloquer--;
          debloquees.push(`${jjmm(nuit.debut)} (${nuit.minStayAvant} → ${nuit.nuits} nuit${nuit.nuits > 1 ? "s" : ""} min.)`);
        } else {
          nuit.statut = "echec";
          nuit.detail = erreurEcriture ?? "Beds24 n'a pas confirmé le nouveau séjour minimum.";
          echecs.push(jjmm(nuit.debut));
        }
      }
      const restaurees = aRestaurer.filter((a) => a.roomId === logement.roomId && confirme(a.roomId, a.date, a.minStayAvant));
      if (debloquees.length > 0 || echecs.length > 0) {
        await journaliser({
          action: "nuit_isolee_debloquee",
          categorie: "calendrier",
          libelle: echecs.length > 0 && debloquees.length === 0 ? "Échec du déblocage d'une nuit isolée" : "Nuit isolée débloquée",
          villaId: logement.villaId,
          villaNom: logement.villaNom,
          resume: [debloquees.length ? `Nuits isolées débloquées : ${debloquees.join(", ")}` : null, echecs.length ? `Échec : ${echecs.join(", ")}` : null]
            .filter(Boolean)
            .join(" · "),
          auteur,
          beds24Statut: echecs.length > 0 ? "echec" : "ok",
          beds24Detail: echecs.length > 0 ? (erreurEcriture ?? "Non confirmé par Beds24") : "Séjour minimum abaissé dans Beds24 (Airbnb + Booking.com).",
        });
      }
      if (restaurees.length > 0) {
        await journaliser({
          action: "nuit_isolee_restauree",
          categorie: "calendrier",
          libelle: "Nuits minimum remises (nuit plus isolée)",
          villaId: logement.villaId,
          villaNom: logement.villaNom,
          resume: restaurees.map((a) => `${jjmm(a.date)} : ${a.minStayApres} → ${a.minStayAvant} nuits min.`).join(", "),
          auteur,
          beds24Statut: "ok",
        });
      }
    }
    if (erreurEcriture) rapport.erreur = `Beds24 a refusé la mise à jour : ${erreurEcriture}`;
  } catch (err) {
    console.error("[nuits-isolees]", err);
    rapport.erreur = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }
  return rapport;
}
