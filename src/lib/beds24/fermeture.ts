import { beds24GetCalendar, beds24UpdateCalendar } from "@/lib/beds24/client";
import { nowInMorocco } from "@/lib/now";
import type { Beds24Statut } from "@/lib/journal";

// Fermeture / réouverture des nuits d'un logement dans Beds24 (donc sur Airbnb et Booking.com),
// AVEC vérification : après l'écriture, on relit le calendrier Beds24 pour confirmer que chaque
// nuit est bien dans l'état voulu. Avant, une erreur Beds24 était seulement écrite dans les logs
// et l'app affichait le blocage comme si de rien n'était — Fouad, 2026-10-16 : "c bien bloqué
// partout alors (airbnb et booking ?)".
//
// `debut` = première nuit, `derniere` = dernière nuit INCLUSE (pas le jour du départ), au format
// YYYY-MM-DD — même convention que l'API Beds24 (voir derniereNuit dans actions/reservations.ts).

export type ResultatBeds24 = { statut: Beds24Statut; detail: string };

function nuitsEntre(debut: string, derniere: string): string[] {
  const nuits: string[] = [];
  for (let d = new Date(`${debut}T00:00:00Z`); d <= new Date(`${derniere}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    nuits.push(d.toISOString().slice(0, 10));
  }
  return nuits;
}

function jjmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function messageErreur(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

// Beds24 ne renvoie pas les dates passées : on ne vérifie que les nuits à partir d'aujourd'hui.
function nuitsAVerifier(debut: string, derniere: string): string[] {
  const aujourdhui = nowInMorocco().toISOString().slice(0, 10);
  return nuitsEntre(debut, derniere).filter((n) => n >= aujourdhui);
}

export async function fermerDatesBeds24(roomId: number, debut: string, derniere: string): Promise<ResultatBeds24> {
  try {
    await beds24UpdateCalendar([
      {
        roomId,
        // Fermeture "blackout" (case "Remplacer" de Beds24) EN PLUS de numAvail:0. Test Villa
        // Sofya du 14/10/2026 : avec numAvail:0 seul, Booking.com fermait en ~1 min mais
        // Airbnb restait réservable 24 min à 2 h (Beds24 envoyait pourtant bien 0 à Airbnb).
        // Le même jour, un blackout posé sur des dates déjà à numAvail:0 depuis 12 min (et
        // toujours ouvertes sur Airbnb) les a fermées sur Airbnb en moins de 25 secondes.
        calendar: [{ from: debut, to: derniere, numAvail: 0, override: "blackout" }],
      },
    ]);
  } catch (err) {
    return { statut: "echec", detail: `Beds24 a refusé la fermeture : ${messageErreur(err)}` };
  }

  const aVerifier = nuitsAVerifier(debut, derniere);
  if (aVerifier.length === 0) return { statut: "ok", detail: "Fermeture envoyée à Beds24 (dates passées, non vérifiables)." };

  try {
    const jours = await beds24GetCalendar(roomId, aVerifier[0], aVerifier[aVerifier.length - 1]);
    const ouvertes = aVerifier.filter((n) => jours.find((j) => j.date === n)?.numAvail !== 0);
    if (ouvertes.length > 0) {
      return {
        statut: "echec",
        detail: `Beds24 n'a pas confirmé la fermeture des nuits ${ouvertes.map(jjmm).join(", ")} : elles peuvent encore être réservables sur Airbnb/Booking.com.`,
      };
    }
    return {
      statut: "ok",
      detail: `Nuits du ${jjmm(debut)} au ${jjmm(derniere)} fermées et vérifiées dans Beds24 (Airbnb + Booking.com).`,
    };
  } catch (err) {
    // L'écriture est passée mais la relecture a échoué : on ne peut pas affirmer que c'est fermé.
    return { statut: "echec", detail: `Fermeture envoyée mais non vérifiée (lecture Beds24 impossible) : ${messageErreur(err)}` };
  }
}

export async function rouvrirDatesBeds24(roomId: number, debut: string, derniere: string): Promise<ResultatBeds24> {
  try {
    await beds24UpdateCalendar([
      {
        roomId,
        // Lève aussi la fermeture "blackout" posée à la création (voir fermerDatesBeds24).
        calendar: [{ from: debut, to: derniere, numAvail: 1, override: "none" }],
      },
    ]);
  } catch (err) {
    return { statut: "echec", detail: `Beds24 a refusé la réouverture : ${messageErreur(err)}` };
  }

  const aVerifier = nuitsAVerifier(debut, derniere);
  if (aVerifier.length === 0) return { statut: "ok", detail: "Réouverture envoyée à Beds24 (dates passées)." };

  try {
    const jours = await beds24GetCalendar(roomId, aVerifier[0], aVerifier[aVerifier.length - 1]);
    // Une nuit peut rester à 0 parce qu'une AUTRE réservation l'occupe : ce n'est pas une erreur,
    // on le signale seulement.
    const encoreFermees = aVerifier.filter((n) => jours.find((j) => j.date === n)?.numAvail === 0);
    if (encoreFermees.length > 0) {
      return {
        statut: "ok",
        detail: `Dates rouvertes dans Beds24, sauf ${encoreFermees.map(jjmm).join(", ")} (encore prises par une autre réservation ou fermées à la main).`,
      };
    }
    return { statut: "ok", detail: `Nuits du ${jjmm(debut)} au ${jjmm(derniere)} rouvertes dans Beds24 (Airbnb + Booking.com).` };
  } catch {
    return { statut: "ok", detail: "Réouverture envoyée à Beds24 (non relue)." };
  }
}
