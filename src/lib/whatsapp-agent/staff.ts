import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, staffAssignmentRequests, reservations, chatMessages, villas } from "@/db/schema";

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

type Job = {
  villaNom: string;
  dateArrivee: string; // YYYY-MM-DD
  dateDepart: string;
  avecDejeuner: boolean;
};

function buildOfferMessage(job: Job): string {
  const repas = job.avecDejeuner ? "الفطور والغداء" : "الفطور فقط";
  return `السلام عليكم،\n\nهل يمكنك الطبخ في ${job.villaNom} من ${job.dateArrivee} إلى ${job.dateDepart}؟ (${repas})\n\nأجيبي بـ "نعم" أو "لا" من فضلك.\n\nموديرنا أجونسي`;
}

async function findNextCandidate(reservationId: string, checkIn: string, checkOut: string, excludeIds: string[]) {
  const db = getDb();
  const candidates = await db
    .select({ id: personnel.id, nom: personnel.nom, telephone: personnel.telephone })
    .from(personnel)
    .where(and(eq(personnel.role, "cuisine"), eq(personnel.actif, true)));

  for (const c of candidates) {
    if (!c.telephone || excludeIds.includes(c.id)) continue;
    // Occupée si déjà affectée (cuisine) à une autre réservation dont les dates chevauchent.
    const conflict = await db
      .select({ id: personnelAffectations.id })
      .from(personnelAffectations)
      .innerJoin(reservations, eq(reservations.id, personnelAffectations.reservationId))
      .where(
        and(
          eq(personnelAffectations.personnelId, c.id),
          ne(personnelAffectations.reservationId, reservationId),
          lt(reservations.checkIn, new Date(checkOut)),
          gt(reservations.checkOut, new Date(checkIn))
        )
      )
      .limit(1);
    if (conflict.length === 0) return c;
  }
  return null;
}

// Point d'entrée : appelé juste après la création d'une réservation WhatsApp où le client a
// demandé une cuisinière. Cherche la première candidate disponible et lui envoie la proposition.
export async function initiateCuisineRequest(reservationId: string, job: Job) {
  const db = getDb();
  const candidate = await findNextCandidate(reservationId, job.dateArrivee, job.dateDepart, []);

  if (!candidate) {
    await db
      .insert(staffAssignmentRequests)
      .values({ reservationId, role: "cuisine", statut: "sans_candidat" })
      .onConflictDoUpdate({ target: [staffAssignmentRequests.reservationId, staffAssignmentRequests.role], set: { statut: "sans_candidat", updatedAt: new Date() } });
    await notifyTeam(reservationId, `⚠️ Aucune cuisinière disponible (avec téléphone, pas déjà prise) pour ${job.villaNom}, ${job.dateArrivee} → ${job.dateDepart} — à affecter manuellement.`);
    return;
  }

  await db
    .insert(staffAssignmentRequests)
    .values({ reservationId, role: "cuisine", statut: "en_recherche", candidatActuelId: candidate.id, candidatsEssayes: [candidate.id] })
    .onConflictDoUpdate({
      target: [staffAssignmentRequests.reservationId, staffAssignmentRequests.role],
      set: { statut: "en_recherche", candidatActuelId: candidate.id, candidatsEssayes: [candidate.id], updatedAt: new Date() },
    });
  await sendWhatsAppText(candidate.telephone!, buildOfferMessage(job));
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

  if (decision === "oui") {
    await db.insert(personnelAffectations).values({ reservationId: request.reservationId, personnelId: request.candidatActuelId! }).onConflictDoNothing();
    await db
      .update(staffAssignmentRequests)
      .set({ statut: "confirme", personnelConfirmeId: request.candidatActuelId, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));

    const villa = request.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, request.villaId)).limit(1))[0] : null;
    await notifyTeam(
      request.reservationId,
      `✅ ${request.candidatNom} confirmée pour la cuisine — ${villa?.nom ?? "villa"}, ${new Date(request.checkIn).toLocaleDateString("fr-FR")} → ${new Date(request.checkOut).toLocaleDateString("fr-FR")}.`
    );
    return `شكرا جزيلا! تم تأكيدك. موديرنا أجونسي`;
  }

  // decision === "non" : cascade vers la candidate suivante.
  const excludeIds = [...(request.candidatsEssayes as string[]), request.candidatActuelId!];
  const villa = request.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, request.villaId)).limit(1))[0] : null;
  const avecDejeuner = /d[ée]jeuner/.test((request.notes ?? "").toLowerCase().replace("petit-déjeuner", "").replace("petit déjeuner", ""));
  const job: Job = {
    villaNom: villa?.nom ?? "Villa",
    dateArrivee: new Date(request.checkIn).toISOString().slice(0, 10),
    dateDepart: new Date(request.checkOut).toISOString().slice(0, 10),
    avecDejeuner,
  };
  const next = await findNextCandidate(request.reservationId, job.dateArrivee, job.dateDepart, excludeIds);

  if (!next) {
    await db
      .update(staffAssignmentRequests)
      .set({ statut: "sans_candidat", candidatsEssayes: excludeIds, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));
    await notifyTeam(request.reservationId, `⚠️ Plus aucune cuisinière disponible pour ${job.villaNom}, ${job.dateArrivee} → ${job.dateDepart} (toutes sollicitées ou occupées) — à affecter manuellement.`);
    return `لا مشكلة، شكرا على الرد.`;
  }

  await db
    .update(staffAssignmentRequests)
    .set({ candidatActuelId: next.id, candidatsEssayes: [...excludeIds, next.id], updatedAt: new Date() })
    .where(eq(staffAssignmentRequests.id, request.requestId));
  await sendWhatsAppText(next.telephone!, buildOfferMessage(job));
  return `لا مشكلة، شكرا على الرد.`;
}
