import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { startOfDay, endOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, villas, domaines } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { sendWhatsAppTemplate, sendWhatsAppVoice } from "@/lib/whatsapp-agent/send";
import { villaLabel, dayAfter } from "@/lib/whatsapp-agent/staff";

// Brahim (jardinier/coursier) fait les courses la veille de chaque ménage de départ, pour que
// tout soit prêt avant l'arrivée de la femme de ménage — Kamel, 2026-09-16 : "dans la logique, le
// mieux c'est que lui, il fasse les courses la veille, comme ça il est tranquille". Un seul
// destinataire fixe, hors du répertoire personnel (ménage/cuisine) comme le reste de l'équipe.
const BRAHIM_PHONE = "+212666738828";

// Modèle Meta approuvé le 2026-09-18 (catégorie Marketing — "Utilitaire" a été refusé par le
// classificateur automatique de Meta à cause du "réponds oui/non") — contourne la fenêtre de 24h
// WhatsApp, indispensable puisque Brahim n'écrit pas à l'agence tous les jours (erreur 131047
// constatée en texte libre). Un seul paramètre {{1}} = buildBrahimDetail(...) ci-dessous.
const BRAHIM_TEMPLATE_NAME = "moderna_courses_brahim";
const BRAHIM_TEMPLATE_LANG = "ar";

// Étiquette portée par chaque envoi dans le journal des messages sortants — permet de retrouver
// l'historique des rappels de courses sans le deviner d'après le texte (voir
// whatsappOutboundMessages dans db/schema.ts).
const CONTEXTE = "courses-brahim";

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
  await sendBrahimCoursesMessage(villaLabels);
  await db
    .update(reservations)
    .set({ brahimPrevenuAt: new Date() })
    .where(inArray(reservations.id, concerned.map((d) => d.reservationId)));
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return { sent: true, villas: villaLabels };
}

// Renvoi manuel depuis la ligne d'affectation ménage/départ dans l'app (bouton "Prévenir
// Brahim") — en plus du cron quotidien, pour renvoyer à la demande (ex. Brahim n'a rien reçu) ou
// un cas particulier. Contrairement au cron, ne vérifie pas que le départ est "demain" — c'est à
// la personne qui clique de juger du bon moment (elle voit la date sur la même page).
export async function notifyBrahimForReservation(reservationId: string): Promise<{ sent: boolean; villa: string | null }> {
  const db = getDb();
  const [row] = await db
    .select({ villaNom: villas.nom, villaNumero: villas.numero, status: reservations.status })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!row || row.status === "annulee") return { sent: false, villa: null };

  const label = villaLabel(row.villaNom ?? "Villa", row.villaNumero ?? null);
  await sendBrahimCoursesMessage([label]);
  await db.update(reservations).set({ brahimPrevenuAt: new Date() }).where(eq(reservations.id, reservationId));
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath(`/reservations/${reservationId}`);
  return { sent: true, villa: label };
}

// Coeur commun des deux points d'entrée ci-dessus : texte via le modèle approuvé — fiable tous
// les jours, fenêtre 24h ou pas. Le vocal reste un envoi à part (Meta n'autorise pas l'audio dans
// un modèle) : best-effort, ne passe que si Brahim a écrit à l'agence récemment — voir le
// commentaire sur BRAHIM_TEMPLATE_NAME plus haut.
async function sendBrahimCoursesMessage(villaLabels: string[]): Promise<void> {
  const detail = buildBrahimDetail(villaLabels);
  await Promise.all([
    sendWhatsAppTemplate(BRAHIM_PHONE, BRAHIM_TEMPLATE_NAME, BRAHIM_TEMPLATE_LANG, [detail], CONTEXTE),
    sendWhatsAppVoice(BRAHIM_PHONE, buildBrahimMessage(detail), CONTEXTE),
  ]);
}

// En darija réel, pas arabe littéraire — même règle que le reste des messages personnel/staff
// (voir buildOfferMessage dans staff.ts). Pas de date explicite dans le texte — Kamel, 2026-09-16 :
// "il ne faut pas que tu dises la date [...] lui il s'en fiche de ça" — seul "غدا" (demain) compte,
// vu que le message part toujours la veille du départ (voir notifyBrahimCourses ci-dessus).
// C'est le {{1}} du modèle moderna_courses_brahim — doit rester identique au texte approuvé par
// Meta (le reste du modèle, salutation/question oui-non/signature, est fixe côté Meta).
function buildBrahimDetail(villaLabels: string[]): string {
  const liste = villaLabels.join("، ");
  const pluriel = villaLabels.length > 1;
  return pluriel
    ? `غدا غادي يخرجو الضيوف من هاد الفيلات: ${liste}. خاصك دير السوق باش يكون كلشي واجد.`
    : `غدا غادي يخرجو الضيوف من ${liste}. خاصك دير السوق باش يكون كلشي واجد.`;
}

// Miroir du modèle Meta (salutation + détail + demande oui/non + signature), pour le vocal —
// demande formulée en oui/non comme les offres ménage/cuisine, Kamel : "il faut qu'ils répondent
// par oui ou par non [...] on a une traçabilité qui est bien acceptée".
function buildBrahimMessage(detail: string): string {
  return `السلام عليكم،\n\n${detail}\n\nواش تقدر تدير السوق؟ جاوبنا بـ "واخا" ولا "لا" عافاك.\n\nموديرنا أجونسي`;
}
