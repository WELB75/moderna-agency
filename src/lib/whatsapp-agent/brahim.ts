import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { startOfDay, endOfDay } from "date-fns";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, villas, domaines } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { sendWhatsAppTextAndVoice } from "@/lib/whatsapp-agent/send";
import { villaLabel, formatDateDarija, dayAfter } from "@/lib/whatsapp-agent/staff";

// Brahim (jardinier/coursier) fait les courses la veille de chaque ménage de départ, pour que
// tout soit prêt avant l'arrivée de la femme de ménage — Kamel, 2026-09-16 : "dans la logique, le
// mieux c'est que lui, il fasse les courses la veille, comme ça il est tranquille". Un seul
// destinataire fixe, hors du répertoire personnel (ménage/cuisine) comme le reste de l'équipe.
const BRAHIM_PHONE = "+212666738828";

// Appelée par le cron quotidien (/api/brahim-courses/sweep), jamais au moment où l'affectation
// est saisie dans le planning : cette saisie peut se faire une semaine à l'avance ("elle planifie
// les femmes de ménage une semaine avant ou autre", Kamel, 2026-09-16), donc seul un balayage
// quotidien qui regarde le lendemain garantit l'envoi "la veille" — peu importe quand
// l'affectation a réellement été faite.
export async function notifyBrahimCourses(targetDateStr?: string): Promise<{ sent: boolean; villas: string[] }> {
  const db = getDb();
  const resolvedDateStr = targetDateStr ?? dayAfter(new Date().toISOString().slice(0, 10));
  const target = new Date(`${resolvedDateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { sent: false, villas: [] };
  const dayStart = startOfDay(target);
  const dayEnd = endOfDay(target);

  const departures = (
    await db
      .select({
        reservationId: reservations.id,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, dayStart), lte(reservations.checkOut, dayEnd)))
  ).filter((d) => domaineEstActif(d.domaineNom) && villaEstGeree(d.villaNom ?? ""));

  if (departures.length === 0) return { sent: false, villas: [] };

  // Seuls les départs pour lesquels une femme de ménage est déjà affectée comptent — un départ
  // sans personne assignée n'a rien de "validé" pour Brahim (Kamel, 2026-09-16 : "à partir du
  // moment où elle a mis les [...] femmes de ménage [...] dans l'application [...] c'est que ça a
  // été validé avec elles").
  const menageAssigne = await db
    .select({ reservationId: personnelAffectations.reservationId })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(
      and(
        eq(personnel.role, "menage"),
        eq(personnelAffectations.moment, "depart"),
        inArray(
          personnelAffectations.reservationId,
          departures.map((d) => d.reservationId)
        )
      )
    );
  const assignedIds = new Set(menageAssigne.map((m) => m.reservationId));
  const concerned = departures.filter((d) => assignedIds.has(d.reservationId));
  if (concerned.length === 0) return { sent: false, villas: [] };

  const villaLabels = concerned.map((d) => villaLabel(d.villaNom ?? "Villa", d.villaNumero ?? null));
  const message = buildBrahimMessage(villaLabels, formatDateDarija(resolvedDateStr));
  await sendWhatsAppTextAndVoice(BRAHIM_PHONE, message);
  return { sent: true, villas: villaLabels };
}

// En darija réel, pas arabe littéraire — même règle que le reste des messages personnel/staff
// (voir buildOfferMessage dans staff.ts).
function buildBrahimMessage(villaLabels: string[], dateLabel: string): string {
  const liste = villaLabels.join("، ");
  const pluriel = villaLabels.length > 1;
  return (
    `السلام عليكم إبراهيم،\n\n` +
    `عافاك دير السوق اليوم، حيت غدا ${dateLabel} كاين خروج ضيوف ف${pluriel ? "هاد الفيلات" : "هاد الفيلا"}: ${liste}. ` +
    `خاص كلشي يكون واجد قبل ما توصل الخدامة.\n\n` +
    `موديرنا أجونسي`
  );
}
