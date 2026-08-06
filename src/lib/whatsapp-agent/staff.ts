import Anthropic from "@anthropic-ai/sdk";
import { and, avg, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, staffAssignmentRequests, reservations, chatMessages, villas, domaines } from "@/db/schema";
import { domaineEstActif } from "@/lib/domaines-actifs";

// Note neutre attribuée à une candidate sans aucune note pour l'instant — ni pénalisée (en
// dessous d'une candidate moyenne) ni avantagée (au-dessus d'une bonne candidate déjà prouvée).
const NEUTRAL_RATING = 3;

// Délai sans réponse au-delà duquel on considère qu'un batch de candidates ne viendra pas et on
// relance vers de nouvelles candidates — décidé par Kamel le 2026-08-04, après avoir remarqué que
// des demandes restaient bloquées des heures/jours en "En recherche" sans qu'aucun "non" explicite
// ne soit jamais reçu.
const STALE_TIMEOUT_MS = 60 * 60 * 1000;

// Nombre de candidates sollicitées en même temps (2026-08-04, Kamel : "au pire on envoie le meme
// message a 3 personnes, la premiere qui repond prend le projet, et apres on les informes que
// c'est bon c'est réglé") — la première à répondre "oui" gagne, les autres sont prévenues.
const BATCH_SIZE = 3;

// Kamel reçoit une copie de chaque offre envoyée au personnel, pour suivre le fil en temps réel
// sans être une vraie candidate (il ne répondra jamais) — en plus de l'historique déjà consultable
// sur /agent-ia. Kamel, 2026-08-04 : "fais comme si je faisais partie du groupe à chaque fois mais
// je répondrais pas, c'est juste pour suivre le fil." Son numéro n'entre jamais dans
// candidatsSollicitesIds/refusIds — il n'est jamais un vrai candidat, juste un destinataire en plus.
const OBSERVER_PHONE = "+33672516297";

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

type HistoriqueEntry = { at: string; type: "offre" | "reponse" | "relance"; candidatNom: string; texte: string };

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

// Retourne jusqu'à `limit` candidates disponibles (mieux notées en premier), pour une sollicitation
// groupée plutôt qu'une seule à la fois — voir BATCH_SIZE.
async function findAvailableCandidates(
  role: "cuisine" | "menage",
  reservationId: string,
  dateDebut: string,
  dateFin: string,
  excludeIds: string[],
  limit: number
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

  const available: typeof candidates = [];
  for (const c of candidates) {
    if (available.length >= limit) break;
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
    if (conflict.length === 0) available.push(c);
  }
  return available;
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

  // On ne gère au quotidien que le Domaine Moderna II (5 villas) pour l'instant — Noria et
  // Zaraba sont mis de côté (voir domaines-actifs.ts). Kamel, 2026-08-06 : "envoie que des
  // messages pour le domaine moderna 2 avec les 5 villas qu'on gere ! le reste on fait pas
  // pour le moment (noria et zaraba)". Aucune sollicitation WhatsApp, aucune ligne créée.
  const [resa] = await db
    .select({ villaId: reservations.villaId, domaineNom: domaines.nom })
    .from(reservations)
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .leftJoin(domaines, eq(domaines.id, villas.domaineId))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!domaineEstActif(resa?.domaineNom)) return;

  // Certaines personnes sont fixes sur une villa donnée, payées directement par le propriétaire
  // (ex. Khaoula à Villa Sofya, Aisha à Villa Wimiliim — voir villas.personnelPayeParProprietaireNoms)
  // : pas de sens à les "consulter" par une offre WhatsApp comme une candidate parmi d'autres,
  // elles font ce travail sur cette villa de toute façon. Affectation directe, sans passer par le
  // cycle offre/réponse. Kamel, 2026-08-04 : "Khaoula est fixe dans la villa sofiya donc l'agent
  // IA doit pas la consulter en premier".
  if (resa?.villaId) {
    const [villa] = await db
      .select({ personnelPayeParProprietaireNoms: villas.personnelPayeParProprietaireNoms })
      .from(villas)
      .where(eq(villas.id, resa.villaId))
      .limit(1);
    const nomsFixes = villa?.personnelPayeParProprietaireNoms ?? [];
    if (nomsFixes.length > 0) {
      const [fixe] = await db
        .select({ id: personnel.id, nom: personnel.nom })
        .from(personnel)
        .where(and(eq(personnel.role, job.role), eq(personnel.actif, true), inArray(personnel.nom, nomsFixes)))
        .limit(1);
      if (fixe) {
        await db.insert(personnelAffectations).values({ reservationId, personnelId: fixe.id }).onConflictDoNothing();
        await db.insert(staffAssignmentRequests).values({
          reservationId,
          role: job.role,
          statut: "confirme",
          personnelConfirmeId: fixe.id,
          historique: [
            {
              at: new Date().toISOString(),
              type: "offre",
              candidatNom: fixe.nom,
              texte: `Affectation automatique — ${fixe.nom} est fixe sur ${job.villaNom} (payée directement par le propriétaire), pas de sollicitation WhatsApp nécessaire.`,
            },
          ],
        });
        return;
      }
    }
  }

  const candidates = await findAvailableCandidates(job.role, reservationId, job.dateDebut, job.dateFin, [], BATCH_SIZE);

  if (candidates.length === 0) {
    await db.insert(staffAssignmentRequests).values({ reservationId, role: job.role, statut: "sans_candidat" });
    await notifyTeam(
      reservationId,
      `⚠️ Aucune candidate disponible (avec téléphone, pas déjà prise) pour ${ROLE_LABEL[job.role]} — ${job.villaNom}, ${job.dateDebut} → ${job.dateFin} — à affecter manuellement.`
    );
    return;
  }

  const offre = buildOfferMessage(job);
  await db.insert(staffAssignmentRequests).values({
    reservationId,
    role: job.role,
    statut: "en_recherche",
    candidatsSollicitesIds: candidates.map((c) => c.id),
    candidatsEssayes: candidates.map((c) => c.id),
    historique: candidates.map((c) => ({ at: new Date().toISOString(), type: "offre" as const, candidatNom: c.nom, texte: offre })),
  });
  await Promise.all([...candidates.map((c) => sendWhatsAppText(c.telephone!, offre)), sendWhatsAppText(OBSERVER_PHONE, offre)]);
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

// Champs communs à toute demande en cours, indépendants de qui la consulte — le sous-ensemble
// dont broadcastNewBatch a besoin pour relancer un nouveau batch.
type StaffRequestContext = {
  requestId: string;
  reservationId: string;
  role: "cuisine" | "menage";
  candidatsEssayes: unknown;
  villaId: string | null;
  checkIn: Date;
  checkOut: Date;
  notes: string | null;
};

// Cherche une demande en cours dont le batch sollicité inclut ce numéro — permet au webhook de
// distinguer une réponse d'employée d'un message client normal. Le filtrage sur "candidatsSollicitesIds
// contient cet id" se fait côté JS plutôt qu'avec un opérateur jsonb dédié : le volume de demandes
// en_recherche simultanées reste faible (une poignée), donc la simplicité prime.
export async function findPendingRequestForPhone(phone: string) {
  const db = getDb();
  const [person] = await db.select({ id: personnel.id, nom: personnel.nom }).from(personnel).where(eq(personnel.telephone, phone)).limit(1);
  if (!person) return null;

  const pending = await db
    .select({
      requestId: staffAssignmentRequests.id,
      reservationId: staffAssignmentRequests.reservationId,
      role: staffAssignmentRequests.role,
      candidatsSollicitesIds: staffAssignmentRequests.candidatsSollicitesIds,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      refusIds: staffAssignmentRequests.refusIds,
      historique: staffAssignmentRequests.historique,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      notes: reservations.notes,
    })
    .from(staffAssignmentRequests)
    .innerJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .where(eq(staffAssignmentRequests.statut, "en_recherche"));

  const match = pending.find((r) => (r.candidatsSollicitesIds as string[]).includes(person.id));
  if (!match) return null;
  return { ...match, candidatId: person.id, candidatNom: person.nom };
}

type StaffRequestRow = NonNullable<Awaited<ReturnType<typeof findPendingRequestForPhone>>>;

// Demandes en cours depuis plus de STALE_TIMEOUT_MS sans qu'aucune réponse n'ait fait avancer
// leur statut — le batch entier n'a manifestement pas vu/répondu au message.
async function findStaleRequests(): Promise<StaffRequestContext[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS);
  return db
    .select({
      requestId: staffAssignmentRequests.id,
      reservationId: staffAssignmentRequests.reservationId,
      role: staffAssignmentRequests.role,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      notes: reservations.notes,
    })
    .from(staffAssignmentRequests)
    .innerJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .where(and(eq(staffAssignmentRequests.statut, "en_recherche"), lt(staffAssignmentRequests.updatedAt, cutoff)));
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

function buildJobFromRequest(request: StaffRequestContext, villaNom: string): Job {
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

// Relance un nouveau batch de candidates (tout le batch précédent a refusé, ou timeout sans
// réponse) : marque "sans_candidat" si personne d'autre n'est disponible, sinon envoie l'offre à
// jusqu'à BATCH_SIZE nouvelles candidates et remplace le batch sollicité. `extraHistoriqueEntries`
// (ex. le refus qui a vidé le batch, ou la note de relance timeout) est ajouté de façon atomique
// (concaténation jsonb côté SQL, pas un remplacement de tableau lu en JS) pour ne jamais écraser
// une entrée écrite entre-temps par une autre réponse arrivée en parallèle sur la même demande.
async function broadcastNewBatch(request: StaffRequestContext, villaNom: string, extraHistoriqueEntries: HistoriqueEntry[]): Promise<void> {
  const db = getDb();
  const excludeIds = request.candidatsEssayes as string[];
  const job = buildJobFromRequest(request, villaNom);
  const candidates = await findAvailableCandidates(request.role, request.reservationId, job.dateDebut, job.dateFin, excludeIds, BATCH_SIZE);

  if (candidates.length === 0) {
    await db
      .update(staffAssignmentRequests)
      .set({
        statut: "sans_candidat",
        historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify(extraHistoriqueEntries)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(staffAssignmentRequests.id, request.requestId));
    await notifyTeam(
      request.reservationId,
      `⚠️ Plus aucune candidate disponible pour ${ROLE_LABEL[request.role]} — ${job.villaNom}, ${job.dateDebut} → ${job.dateFin} (toutes sollicitées ou occupées) — à affecter manuellement.`
    );
    return;
  }

  const offre = buildOfferMessage(job);
  const offreEntries: HistoriqueEntry[] = candidates.map((c) => ({ at: new Date().toISOString(), type: "offre", candidatNom: c.nom, texte: offre }));
  await db
    .update(staffAssignmentRequests)
    .set({
      // Explicite plutôt que déduit de l'état précédent : les deux appelants existants (refus,
      // timeout) sont déjà "en_recherche"/sans confirmée, mais handleCancellationReply rouvre une
      // demande qui était "confirme" — ce reset doit s'appliquer dans les deux cas.
      statut: "en_recherche",
      personnelConfirmeId: null,
      candidatsSollicitesIds: candidates.map((c) => c.id),
      candidatsEssayes: [...excludeIds, ...candidates.map((c) => c.id)],
      refusIds: [],
      historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify([...extraHistoriqueEntries, ...offreEntries])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(staffAssignmentRequests.id, request.requestId));
  await Promise.all([...candidates.map((c) => sendWhatsAppText(c.telephone!, offre)), sendWhatsAppText(OBSERVER_PHONE, offre)]);
}

// Relance automatique : un batch entier qui ne répond ni "oui" ni "non" dans le délai imparti est
// considéré indisponible — sinon la demande restait bloquée indéfiniment (avant ce correctif,
// seul un refus explicite faisait avancer la cascade). Appelée à chaque message WhatsApp entrant
// (trafic fréquent en pratique) et par un cron quotidien de secours pour les périodes creuses
// (voir /api/staff-requests/sweep).
export async function cascadeStaleRequests(): Promise<void> {
  const stale = await findStaleRequests();
  for (const request of stale) {
    const db = getDb();
    const villa = request.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, request.villaId)).limit(1))[0] : null;
    const relanceEntry: HistoriqueEntry = {
      at: new Date().toISOString(),
      type: "relance",
      candidatNom: "",
      texte: `Pas de réponse sous ${Math.round(STALE_TIMEOUT_MS / (60 * 60 * 1000))}h — relance vers de nouvelles candidates.`,
    };
    await broadcastNewBatch(request, villa?.nom ?? "Villa", [relanceEntry]);
  }
}

// Prévient les autres candidates du même batch, une fois l'une d'elles confirmée — pour que
// personne ne reste sans réponse alors que la mission est déjà attribuée (Kamel, 2026-08-04 :
// "après on les informes que c'est bon c'est réglé").
async function notifyOthers(candidatsSollicitesIds: string[], winnerId: string): Promise<void> {
  const others = candidatsSollicitesIds.filter((id) => id !== winnerId);
  if (others.length === 0) return;
  const db = getDb();
  const rows = await db.select({ telephone: personnel.telephone }).from(personnel).where(inArray(personnel.id, others));
  await Promise.all(
    rows.filter((r) => r.telephone).map((r) => sendWhatsAppText(r.telephone!, `شكرا على ردك، تم إسناد المهمة لشخص آخر أسرع. موديرنا أجونسي`))
  );
}

// Traite la réponse d'une candidate sollicitée dans le batch en cours. "oui" confirme — via un
// UPDATE conditionnel (WHERE statut='en_recherche') qui garantit qu'une seule des candidates
// sollicitées en parallèle peut effectivement gagner, même si plusieurs répondent "oui" à
// quelques secondes d'écart. "non" retire la candidate du batch ; si c'était la dernière encore
// en attente, relance immédiatement un nouveau batch sans attendre le timeout. Renvoie le texte à
// répondre à l'expéditeur (l'employée).
export async function handleStaffReply(request: StaffRequestRow, text: string): Promise<string> {
  const db = getDb();
  const decision = await interpretReply(text);
  const reponseEntry: HistoriqueEntry = { at: new Date().toISOString(), type: "reponse", candidatNom: request.candidatNom, texte: text };

  if (decision === "incertain") {
    await db
      .update(staffAssignmentRequests)
      .set({ historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify([reponseEntry])}::jsonb`, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));
    return `عذرا، لم أفهم. من فضلك أجيبي بـ "نعم" أو "لا".`;
  }

  const villa = request.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, request.villaId)).limit(1))[0] : null;

  if (decision === "oui") {
    const won = await db
      .update(staffAssignmentRequests)
      .set({
        statut: "confirme",
        personnelConfirmeId: request.candidatId,
        historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify([reponseEntry])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(staffAssignmentRequests.id, request.requestId), eq(staffAssignmentRequests.statut, "en_recherche")))
      .returning({ id: staffAssignmentRequests.id });

    if (won.length === 0) {
      // Une autre candidate du même batch a déjà été confirmée entre-temps — trace quand même
      // cette réponse tardive, sans toucher au statut déjà fixé.
      await db
        .update(staffAssignmentRequests)
        .set({ historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify([reponseEntry])}::jsonb`, updatedAt: new Date() })
        .where(eq(staffAssignmentRequests.id, request.requestId));
      return `شكرا على ردك، لكن المهمة أُسندت لشخص آخر أسرع منك. شكرا جزيلا! موديرنا أجونسي`;
    }

    await db.insert(personnelAffectations).values({ reservationId: request.reservationId, personnelId: request.candidatId }).onConflictDoNothing();
    await notifyTeam(
      request.reservationId,
      `✅ ${request.candidatNom} confirmée pour ${ROLE_LABEL[request.role]} — ${villa?.nom ?? "villa"}, ${new Date(request.checkIn).toLocaleDateString("fr-FR")} → ${new Date(request.checkOut).toLocaleDateString("fr-FR")}.`
    );
    await notifyOthers(request.candidatsSollicitesIds as string[], request.candidatId);
    return `شكرا جزيلا! تم تأكيدك. موديرنا أجونسي`;
  }

  // decision === "non" : retire la candidate du batch. Si c'était la dernière encore en attente
  // (les autres ont déjà toutes refusé), relance un nouveau batch immédiatement.
  const newRefusIds = [...(request.refusIds as string[]), request.candidatId];
  const remaining = (request.candidatsSollicitesIds as string[]).filter((id) => !newRefusIds.includes(id));

  if (remaining.length > 0) {
    await db
      .update(staffAssignmentRequests)
      .set({ refusIds: newRefusIds, historique: sql`${staffAssignmentRequests.historique} || ${JSON.stringify([reponseEntry])}::jsonb`, updatedAt: new Date() })
      .where(eq(staffAssignmentRequests.id, request.requestId));
  } else {
    await broadcastNewBatch(request, villa?.nom ?? "Villa", [reponseEntry]);
  }
  return `لا مشكلة، شكرا على الرد.`;
}

// Cherche une mission CONFIRMÉE (déjà acceptée) rattachée à ce numéro, pas encore passée — permet
// au webhook de reconnaître qu'une candidate déjà confirmée revient annuler, plutôt que de traiter
// son message comme une nouvelle conversation client. `checkOut >= aujourd'hui` exclut les
// missions déjà terminées (rien à annuler une fois le travail fait).
export async function findConfirmedAssignmentForPhone(phone: string) {
  const db = getDb();
  const [person] = await db.select({ id: personnel.id, nom: personnel.nom }).from(personnel).where(eq(personnel.telephone, phone)).limit(1);
  if (!person) return null;

  const [row] = await db
    .select({
      requestId: staffAssignmentRequests.id,
      reservationId: staffAssignmentRequests.reservationId,
      role: staffAssignmentRequests.role,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      historique: staffAssignmentRequests.historique,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      notes: reservations.notes,
    })
    .from(staffAssignmentRequests)
    .innerJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .where(
      and(
        eq(staffAssignmentRequests.statut, "confirme"),
        eq(staffAssignmentRequests.personnelConfirmeId, person.id),
        gte(reservations.checkOut, new Date())
      )
    )
    .limit(1);
  if (!row) return null;
  return { ...row, candidatId: person.id, candidatNom: person.nom };
}

async function interpretCancellation(text: string): Promise<"annulation" | "autre"> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 10,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: `Tu interprètes le message d'un(e) employé(e) déjà CONFIRMÉE pour une mission (ménage ou cuisine), en arabe, darija ou français, texte ou vocal transcrit. Réponds UNIQUEMENT par un seul mot : "annulation" si elle dit qu'elle ne peut finalement plus venir, veut annuler, se désiste ; "autre" pour tout le reste (question, remerciement, ou tout message qui n'est pas clairement une annulation).`,
    messages: [{ role: "user", content: text }],
  });
  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim().toLowerCase() : "";
  return raw.includes("annulation") ? "annulation" : "autre";
}

// Traite le message d'une candidate déjà confirmée. Renvoie null si ce n'est manifestement pas
// une annulation (le webhook laisse alors le message retomber sur le traitement normal, comme
// avant cette fonctionnalité) — pour ne jamais intercepter à tort un message qui n'a rien à voir.
// Si c'est une annulation : retire l'affectation, rouvre la demande et relance immédiatement une
// recherche de remplaçante (même mécanisme que "tout le batch a refusé"), prévient l'équipe.
// Kamel, 2026-08-05 : "si elle change d'avis et revienne vers l'agent ia pour annuler, lui il ira
// chercher quelqu'un d'autres".
export async function handleCancellationReply(
  assignment: NonNullable<Awaited<ReturnType<typeof findConfirmedAssignmentForPhone>>>,
  text: string
): Promise<string | null> {
  const decision = await interpretCancellation(text);
  if (decision === "autre") return null;

  const db = getDb();
  const villa = assignment.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, assignment.villaId)).limit(1))[0] : null;

  await db
    .delete(personnelAffectations)
    .where(and(eq(personnelAffectations.reservationId, assignment.reservationId), eq(personnelAffectations.personnelId, assignment.candidatId)));

  await notifyTeam(
    assignment.reservationId,
    `⚠️ ${assignment.candidatNom} a annulé pour ${ROLE_LABEL[assignment.role]} — ${villa?.nom ?? "villa"}, ${new Date(assignment.checkIn).toLocaleDateString("fr-FR")} → ${new Date(assignment.checkOut).toLocaleDateString("fr-FR")} — recherche d'une remplaçante en cours.`
  );

  const annulationEntry: HistoriqueEntry = {
    at: new Date().toISOString(),
    type: "reponse",
    candidatNom: assignment.candidatNom,
    texte: `Annulation : ${text}`,
  };
  await broadcastNewBatch(assignment, villa?.nom ?? "Villa", [annulationEntry]);

  return `تم إلغاء تأكيدك، شكرا على إخبارنا. سنبحث عن شخص آخر. موديرنا أجونسي`;
}
