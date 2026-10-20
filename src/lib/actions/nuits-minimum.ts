"use server";

import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { beds24AlertesEcriture, beds24GetCalendars, beds24UpdateCalendar, type Beds24CalendarWrite } from "@/lib/beds24/client";
import { pricelabsGetListings, pricelabsGetOverrides, pricelabsUpsertOverrides, type PricelabsListing, type PricelabsOverride } from "@/lib/pricelabs/client";
import { annoncesCandidates, choisirAnnonce } from "@/lib/pricelabs/annonce";
import { analyserNuitsIsolees, enregistrerNuitsMinManuelles, type RapportNuitsIsolees } from "@/lib/beds24/nuits-isolees";
import { auteurConnecte, journaliser } from "@/lib/journal";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";

// Panneau "Gérer le nombre de nuits minimum" de la vue planning, sur le modèle de SuperHote v2
// (Fouad, 2026-10-20 : "si on clique sur le nombre de nuits minimum, on peut modifier directement
// le nombre de nuits, par exemple passer à une. Il faut que tu rendes ça possible").
//
// La valeur est écrite à DEUX endroits :
// 1. PriceLabs, en dérogation par date (DSO) : c'est PriceLabs qui pousse les nuits minimum vers
//    Beds24 chaque jour. Sans dérogation, il écraserait la saisie à sa prochaine synchro
//    (l'avertissement affiché par SuperHote). Une dérogation déjà posée sur la date (prix...) est
//    conservée, seul son séjour minimum change.
// 2. Beds24, tout de suite, pour qu'Airbnb et Booking.com l'aient sans attendre PriceLabs — puis
//    relu pour confirmer.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NUITS = 365;
const MAX_JOURS = 366;
const LIBELLES_JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export type ResultatNuitsMin = {
  villaId: string;
  villaNom: string;
  beds24: { ok: boolean; detail: string };
  pricelabs: { ok: boolean; detail: string };
};

function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function jjmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function messageErreur(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

function plagesConsecutives(dates: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const d of [...dates].sort()) {
    const dernier = out[out.length - 1];
    if (dernier && ajouterJours(dernier.to, 1) === d) dernier.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

async function deroger(listing: PricelabsListing, dates: string[], minStay: number): Promise<{ ok: boolean; detail: string }> {
  try {
    const existantes = new Map(
      (await pricelabsGetOverrides(listing.id, listing.pms, dates[0], dates[dates.length - 1])).map((o) => [o.date, o])
    );
    const overrides: PricelabsOverride[] = dates.map((date) => {
      const existante = existantes.get(date);
      return {
        ...(existante ?? {}),
        date,
        min_stay: minStay,
        reason: existante?.reason ?? "Nuits minimum fixées depuis l'app Moderna",
      };
    });
    await pricelabsUpsertOverrides(listing.id, listing.pms, overrides);
    return { ok: true, detail: `Enregistré dans PriceLabs (${dates.length} date${dates.length > 1 ? "s" : ""}) : ne sera pas écrasé à la prochaine synchro.` };
  } catch (err) {
    return { ok: false, detail: `PriceLabs a refusé la dérogation : ${messageErreur(err)}` };
  }
}

export async function modifierNuitsMinimum(input: {
  villaIds: string[];
  debut: string; // première date (arrivées concernées), incluse
  fin: string; // dernière date, incluse
  minStay: number;
  joursSemaine?: number[] | null; // 0 = dimanche … 6 = samedi ; vide/null = tous les jours
}): Promise<{ nbDates: number; resultats: ResultatNuitsMin[] }> {
  await auth.protect();

  const minStay = Math.round(Number(input.minStay));
  if (!Number.isInteger(minStay) || minStay < 1 || minStay > MAX_NUITS) throw new Error("Nombre de nuits minimum invalide.");
  if (!DATE_RE.test(input.debut) || !DATE_RE.test(input.fin) || input.fin < input.debut) throw new Error("Période invalide.");
  const aujourdhui = nowInMorocco().toISOString().slice(0, 10);
  if (input.fin < aujourdhui) throw new Error("La période est entièrement passée.");
  const debut = input.debut < aujourdhui ? aujourdhui : input.debut;
  if ((Date.parse(`${input.fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000 > MAX_JOURS) throw new Error("Période trop longue (1 an maximum).");

  const jours = input.joursSemaine && input.joursSemaine.length > 0 && input.joursSemaine.length < 7 ? new Set(input.joursSemaine) : null;
  const dates: string[] = [];
  for (let d = debut; d <= input.fin; d = ajouterJours(d, 1)) {
    if (!jours || jours.has(new Date(`${d}T00:00:00Z`).getUTCDay())) dates.push(d);
  }
  if (dates.length === 0) throw new Error("Aucune date de la période ne correspond aux jours choisis.");

  const ids = [...new Set(input.villaIds)].filter(Boolean);
  if (ids.length === 0) throw new Error("Aucun logement sélectionné.");

  const db = getDb();
  const logements = (
    await db
      .select({
        id: villas.id,
        nom: villas.nom,
        beds24RoomId: villas.beds24RoomId,
        beds24PropertyId: villas.beds24PropertyId,
        pricelabsListingId: villas.pricelabsListingId,
      })
      .from(villas)
      .where(inArray(villas.id, ids))
  ).filter((v) => villaEstGeree(v.nom));
  if (logements.length === 0) throw new Error("Logement introuvable.");

  let listingById: Map<string, PricelabsListing> | null = null;
  let erreurListings: string | null = null;
  try {
    listingById = new Map((await pricelabsGetListings()).map((l) => [l.id, l]));
  } catch (err) {
    erreurListings = messageErreur(err);
  }

  const resultats: ResultatNuitsMin[] = [];
  for (const v of logements) {
    let pricelabs: ResultatNuitsMin["pricelabs"];
    const listing = listingById ? choisirAnnonce(annoncesCandidates(v), listingById) : null;
    if (!listingById) pricelabs = { ok: false, detail: `PriceLabs injoignable : ${erreurListings}` };
    else if (!listing) pricelabs = { ok: false, detail: "Logement non relié à PriceLabs : seule la valeur Beds24 est modifiée." };
    else pricelabs = await deroger(listing, dates, minStay);
    resultats.push({
      villaId: v.id,
      villaNom: v.nom,
      pricelabs,
      beds24: v.beds24RoomId ? { ok: false, detail: "" } : { ok: false, detail: "Logement non relié à Beds24." },
    });
  }

  // Un seul envoi Beds24 pour tous les logements, puis une seule relecture.
  const plages = plagesConsecutives(dates);
  const envoi: Beds24CalendarWrite[] = logements
    .filter((v) => v.beds24RoomId)
    .map((v) => ({ roomId: Number(v.beds24RoomId), calendar: plages.map((p) => ({ ...p, minStay })) }));
  if (envoi.length > 0) {
    let erreurEcriture: string | null = null;
    let alerteBeds24: string | null = null;
    try {
      alerteBeds24 = beds24AlertesEcriture(await beds24UpdateCalendar(envoi));
    } catch (err) {
      erreurEcriture = messageErreur(err);
    }
    if (alerteBeds24) console.warn("[nuits-minimum] réponse Beds24 :", alerteBeds24);
    const relire = () => beds24GetCalendars(envoi.map((e) => e.roomId), dates[0], dates[dates.length - 1]).catch(() => null);
    let relu = erreurEcriture ? null : await relire();
    const confirmeTout = () =>
      Boolean(relu) && envoi.every((e) => dates.every((d) => relu?.get(e.roomId)?.find((j) => j.date === d)?.minStay === minStay));
    if (!erreurEcriture && !confirmeTout()) {
      await new Promise((r) => setTimeout(r, 3000));
      relu = await relire();
    }
    for (const r of resultats) {
      const v = logements.find((l) => l.id === r.villaId);
      if (!v?.beds24RoomId) continue;
      const roomId = Number(v.beds24RoomId);
      if (erreurEcriture) {
        r.beds24 = { ok: false, detail: `Beds24 a refusé la modification : ${erreurEcriture}` };
        continue;
      }
      if (!relu) {
        r.beds24 = { ok: true, detail: "Envoyé à Beds24 (relecture impossible pour confirmer)." };
        continue;
      }
      const parDate = new Map((relu.get(roomId) ?? []).map((j) => [j.date, j.minStay]));
      const nonConfirmees = dates.filter((d) => parDate.get(d) !== minStay);
      r.beds24 =
        nonConfirmees.length === 0
          ? { ok: true, detail: "Appliqué dans Beds24 : Airbnb et Booking.com sont mis à jour." }
          : {
              ok: false,
              detail: `Beds24 n'a pas confirmé ${nonConfirmees.length} date(s) : ${nonConfirmees.slice(0, 5).map(jjmm).join(", ")}${nonConfirmees.length > 5 ? "…" : ""}${
                alerteBeds24 ? ` (réponse Beds24 : ${alerteBeds24})` : ""
              }`,
            };
    }
  }

  const auteur = await auteurConnecte();
  // Choix manuel mémorisé : la synchro automatique (cron/webhook) ne le remplacera jamais par la
  // valeur PriceLabs, et le réappliquera si l'écriture Beds24 ci-dessus a échoué.
  try {
    await enregistrerNuitsMinManuelles(
      logements.filter((v) => v.beds24RoomId).map((v) => ({ villaId: v.id, roomId: Number(v.beds24RoomId) })),
      dates,
      minStay,
      auteur.nom
    );
  } catch (err) {
    console.error("[nuits-minimum] mémorisation du choix manuel impossible", err);
  }
  const periode = dates.length === 1 ? `le ${jjmm(dates[0])}` : `du ${jjmm(dates[0])} au ${jjmm(dates[dates.length - 1])}`;
  const joursTexte = jours ? ` (${[...jours].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((j) => LIBELLES_JOURS[j]).join(" ")})` : "";
  for (const r of resultats) {
    await journaliser({
      action: "nuits_min_modifiees",
      categorie: "calendrier",
      libelle: "Nuits minimum modifiées",
      villaId: r.villaId,
      villaNom: r.villaNom,
      resume: `${minStay} nuit${minStay > 1 ? "s" : ""} min. ${periode}${joursTexte} · PriceLabs : ${r.pricelabs.ok ? "ok" : "non"}`,
      auteur,
      beds24Statut: r.beds24.ok ? "ok" : "echec",
      beds24Detail: [r.beds24.detail, r.pricelabs.ok ? null : r.pricelabs.detail].filter(Boolean).join(" · "),
    });
  }

  return { nbDates: dates.length, resultats };
}

// Rapport des nuits isolées de tout le parc (lecture seule), affiché au-dessus de la vue planning.
export async function rapportNuitsIsolees(): Promise<RapportNuitsIsolees> {
  await auth.protect();
  return analyserNuitsIsolees({ appliquer: false });
}

// Bouton du bandeau : réécrit tout de suite dans Beds24 les nuits minimum voulues de TOUTES les
// dates (18 mois), nuits isolées comprises — même traitement que le cron, mais forcé.
export async function debloquerNuitsIsoleesMaintenant(): Promise<RapportNuitsIsolees> {
  await auth.protect();
  return analyserNuitsIsolees({ appliquer: true, forcer: true, auteur: await auteurConnecte() });
}
