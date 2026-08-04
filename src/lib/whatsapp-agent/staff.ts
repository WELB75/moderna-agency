import Anthropic from "@anthropic-ai/sdk";
import { and, avg, eq, gt, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, staffAssignmentRequests, reservations, chatMessages, villas } from "@/db/schema";

// Note neutre attribuée à une candidate sans aucune note pour l'instant — ni pénalisée (en
// dessous d'une candidate moyenne) ni avantagée (au-dessus d'une bonne candidate déjà prouvée).
const NEUTRAL_RATING = 3;

const client = new Anthropic();

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;
  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
  });
  if (!res.ok) console.error("Échec envoi WhatsApp (staff):", res.status, await res.text());
}

// Note système postée dans le chat interne (catégorie "menage_cuisine", déjà utilisée par
// l'équipe) pour que l'humain voie ce que l'agent a fait, sans dépendre d'un template WhatsApp
// Meta approuvé (notifyStaffWhatsApp exige ça, pas encore configuré).
async function notifyTeam(reservationId: string, message: string) {
  const db = getDb();
  const [r] = await db.select({ villaId: reservations.villaId }).from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  await db.insert(chatMessages).values({
    categorie: "menage_cuisine",
    villaId: r?.villaId ?? null,
    message,
    createdByUserId: "agent-ia",
    createdByName: "Agent IA (WhatsApp)",
  });
}

const ROLE_LABEL: Record<"cuisine" | "menage", string> = { cuisine: "la cuisine", menage: "le ménage" };

type Job = {
  role: "cuisine" | "menage";
  villaNom: string;
  // Cuisine : jour de début du service (lendemain du check-in) → jour de fin (check-out).
  // Ménage : nettoyage de fin de séjour, un seul jour — dateDebut === dateFin (le check-out).
  dateDebut: string; // YYYY-MM-DD
  dateFin: string;
  avecDejeuner?: boolean; // cuisine uniquement
};

// Le ménage/la cuisine ne commence jamais le jour d'arrivée du client (il vient tout juste
// d'arriver) mais le lendemain — donc la cuisinière est sollicitée pour travailler à partir
// du lendemain du check-in, pas du check-in lui-même.
export function dayAfter(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildOfferMessage(job: Job): string {
  if (job.role === "menage") {
    return `السلام عليكم،\n\nهل يمكنك تنظيف ${job.villaNom} يوم ${job.dateDebut} (مغادرة الضيوف)؟\n\nأجيبي بـ "نعم" أو "لا" من فضلك.\n\nموديرنا أجونسي`;
  }
  const repas = job.avecDejeuner ? "الفطور والغداء" : "الفطور فقط";
  return `السلام عليكم،\n\nهل يمكنك الطبخ في ${job.villaNom} من ${job.dateDebut} إلى ${job.dateFin}؟ (${repas})\n\nأجيبي بـ "نعم" أو "لا" من فضلك.\n\nموديرنا أجونسي`;
}

async function findNextCandidate(
  role: "cuisine" | "menage",
  reservationId: string,
  dateDebut: string,
  dateFin: string,
  excludeIds: string[]
) {
  const db = getDb();
  const candidates = await db
    .select({ id: personnel.id, nom: personnel.nom, telephone: personnel.telephone })
    .from(personnel)
    .where(and(eq(personnel.role, role), eq(personnel.actif, true)));

  // Les mieux notées sont sollicitées en premier (moyenne de toutes leurs notes de séjour) — une
  // candidate jamais notée reçoit une note neutre, ni pénalisée ni avantagée face à une candidate
  // déjà prouvée bonne ou mauvaise.
  const ratings = await db
    .select({ personnelId: personnelAffectations.personnelId, moyenne: avg(personnelAffectations.note) })
    .from(personnelAffectations)
    .where(isNotNull(personnelAffectations.note))
    .groupBy(personnelAffectations.personnelId);
  const ratingByPersonnelId = new Map(ratings.map((r) => [r.personnelId, Number(r.moyenne)]));
  candidates.sort((a, b) => (ratingByPersonnelId.get(b.id) ?? NEUTRAL_RATING) - (ratingByPersonnelId.get(a.id) ?? NEUTRAL_RATING));

  // Pour un nettoyage d'un seul jour, la fenêtre de conflit doit couvrir cette journée entière
  // (le check-out lui-même) — on compare donc contre [dateDebut, dateFin + 1 jour).
  const finExclusive = role === "menage" ? dayAfter(dateFin) : dateFin;

  for (const c of candidates) {
    if (!c.telephone || excludeIds.includes(c.id)) continue;
    // Occupée si déjà affectée (même rôle) à une autre réservation dont les dates chevauchent.
    const conflict = await db
      .select({ id: personnelAffectations.id })
      .from(personnelAffectations)
      .innerJoin(reservations, eq(reservations.id, personnelAffectations.reservationId))
      .where(
        and(
          eq(personnelAffectations.personnelId, c.id),
          ne(personnelAffectations.reservationId, reservationId),
          lt(reservations.checkIn, new Date(finExclusive)),
          gt(reservations.checkOut, new Date(dateDebut))
        )
      )
      .limit(1);
    if (conflict.length === 0) return c;
  }
  return null;
}

// Point d'entrée générique : cherche la première candidate disponible (ménage ou cuisine) et
// lui envoie la proposition WhatsApp. Idempotent — si une affectation existe déjà (posée à la
// main dans Personnel) ou qu'une demande est déjà en cours/traitée pour ce couple
// réservation+rôle, ne fait rien (permet d'appeler cette fonction depuis plusieurs points
// d'entrée — création manuelle, sync iCal, agent WhatsApp — sans risquer un double envoi).
export async function initiateStaffRequest(reservationId: string, job: Job) {
  const db = getDb();

  const dejaAffecte = await db
    .select({ id: personnelAffectations.id })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(and(eq(personnelAffectations.reservationId, reservationId), eq(personnel.role, job.role)))
    .limit(1);
  if (dejaAffecte.length > 0) return;

  const dejaDemande = await db
    .select({ id: staffAssignmentRequests.id })
    .from(staffAssignmentRequests)
    .where(and(eq(staffAssignmentRequests.reservationId, reservationId), eq(staffAssignmentRequests.role, job.role)))
    .limit(1);
  if (dejaDemande.length > 0) return;

  const candidate = await findNextCandidate(job.role, reservationId, job.dateDebut, job.dateFin, []);

  if (!candidate) {
    await db.insert(staffAssignmentRequests).values({ reservationId, role: job.role, statut: "sans_candidat" });
    await notifyTeam(
      reservationId,
      `⚠️ Aucune candidate disponible (avec téléphone, pas déjà prise) pour ${ROLE_LABEL[job.role]} — ${job.villaNom}, ${job.dateDebut} → ${job.dateFin} — à affecter manuellement.`
    );
    return;
  }

  await db
    .insert(staffAssignmentRequests)
    .values({ reservationId, role: job.role, statut: "en_recherche", candidatActuelId: candidate.id, candidatsEssayes: [candidate.id] });
  await sendWhatsAppText(candidate.telephone!, buildOfferMessage(job));
}

// Rétro-compatibilité : ancien nom utilisé par l'agent de réservation pour la cuisine.
export async function initiateCuisineRequest(
  reservationId: string,
  job: { villaNom: string; dateArrivee: string; dateDepart: string; avecDejeuner: boolean }
) {
  await initiateStaffRequest(reservationId, {
    role: "cuisine",
    villaNom: job.villaNom,
    dateDebut: job.dateArrivee,
    dateFin: job.dateDepart,
    avecDejeuner: job.avecDejeuner,
  });
}

// Sollicite automatiquement une femme de ménage pour le nettoyage de fin de séjour (le jour du
// check-out) — appelé pour TOUTE réservation, quelle que soit sa source (Superhote/iCal, saisie
// manuelle, agent WhatsApp), pas seulement celles créées par le bot.
export async function initiateMenageRequest(reservationId: string, villaNom: string, checkOut: string) {
  await initiateStaffRequest(reservationId, {
    role: "menage",
    villaNom,
    dateDebut: checkOut,
    dateFin: checkOut,
  });
}

// Cherche une demande en cours dont le candidat actuel est ce numéro — permet au webhook de
// distinguer une réponse d'employée d'un message client normal.
export async function findPendingRequestForPhone(phone: string) {
  const db = getDb();
  const [row] = await db
    .select({
      requestId: staffAssignmentRequests.id,
      reservationId: staffAssignmentRequests.reservationId,
      role: staffAssignmentRequests.role,
      candidatActuelId: staffAssignmentRequests.candidatActuelId,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      candidatNom: personnel.nom,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      notes: reservations.notes,
    })
    .from(staffAssignmentRequests)
    .innerJoin(personnel, eq(personnel.id, staffAssignmentRequests.candidatActuelId))
    .innerJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .where(and(eq(personnel.telephone, phone), eq(staffAssignmentRequests.statut, "en_recherche")))
    .limit(1);
  return row ?? null;
}

async function interpretReply(text: string): Promise<"oui" | "non" | "incertain"> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 10,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: `Tu interprètes la réponse d'un(e) employé(e) à une proposition de mission (en arabe, darija, ou français, texte ou vocal transcrit). Réponds UNIQUEMENT par un seul mot : "oui" si elle accepte, "non" si elle refuse, "incertain" si ce n'est pas clair.`,
    messages: [{ role: "user", content: text }],
  });
  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim().toLowerCase() : "";
  if (raw.includes("oui")) return "oui";
  if (raw.includes("non")) return "non";
  return "incertain";
}

function buildJobFromRequest(request: NonNullable<Awaited<ReturnType<typeof findPendingRequestForPhone>>>, villaNom: string): Job {
  if (request.role === "menage") {
    const checkOut = new Date(request.checkOut).toISOString().slice(0, 10);
    return { role: "menage", villaNom, dateDebut: checkOut, dateFin: checkOut };
  }
  const avecDejeuner = /d[ée]jeuner/.test((request.notes ?? "").toLowerCase().replace("petit-déjeuner", "").replace("petit déjeuner", ""));
  return {
    role: "cuisine",
    villaNom,
    dateDebut: dayAfter(new Date(request.checkIn).toISOString().slice(0, 10)),
    dateFin: new Date(request.checkOut).toISOString().slice(0, 10),
    avecDejeuner,
  };
}

// Traite la réponse d'une candidate en cours de sollicitation : confirme, ou passe à la
// suivante en cascade si elle refuse. Renvoie le texte à répondre à l'expéditeur (l'employée).
export async function handleStaffReply(
  request: NonNullable<Awaited<ReturnType<typeof findPendingRequestForPhone>>>,
  text: string
): Promise<string> {
  const db = getDb();
  const decision = await interpretReply(text);

  if (decision === "incertain") {
    return `عذرا، لم أفهم. من فضلك أجيبي بـ "نعم" أو "لا".`;
  }

  const villa = request.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, request.villaId)).limit(1))[0] : null;

  if (decision === "oui") {
    await db.insert(personnelAffectations).values({ reservationId: request.reservationId, personnelId: request.candidatActuelId! }).onConflictDoNothing();
    await db
      .update(staffAssignmentRequests)
      .set({ statut: "confirme", personnelConfirmeId: request.candidatActuelId, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));

    await notifyTeam(
      request.reservationId,
      `✅ ${request.candidatNom} confirmée pour ${ROLE_LABEL[request.role]} — ${villa?.nom ?? "villa"}, ${new Date(request.checkIn).toLocaleDateString("fr-FR")} → ${new Date(request.checkOut).toLocaleDateString("fr-FR")}.`
    );
    return `شكرا جزيلا! تم تأكيدك. موديرنا أجونسي`;
  }

  // decision === "non" : cascade vers la candidate suivante.
  const excludeIds = [...(request.candidatsEssayes as string[]), request.candidatActuelId!];
  const job = buildJobFromRequest(request, villa?.nom ?? "Villa");
  const next = await findNextCandidate(request.role, request.reservationId, job.dateDebut, job.dateFin, excludeIds);

  if (!next) {
    await db
      .update(staffAssignmentRequests)
      .set({ statut: "sans_candidat", candidatsEssayes: excludeIds, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));
    await notifyTeam(
      request.reservationId,
      `⚠️ Plus aucune candidate disponible pour ${ROLE_LABEL[request.role]} — ${job.villaNom}, ${job.dateDebut} → ${job.dateFin} (toutes sollicitées ou occupées) — à affecter manuellement.`
    );
    return `لا مشكلة، شكرا على الرد.`;
  }

  await db
    .update(staffAssignmentRequests)
    .set({ candidatActuelId: next.id, candidatsEssayes: [...excludeIds, next.id], updatedAt: new Date() })
    .where(eq(staffAssignmentRequests.id, request.requestId));
  await sendWhatsAppText(next.telephone!, buildOfferMessage(job));
  return `لا مشكلة، شكرا على الرد.`;
}
