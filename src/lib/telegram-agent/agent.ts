import Anthropic from "@anthropic-ai/sdk";
import { desc, eq, ilike, ne, and, inArray } from "drizzle-orm";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { cashEntries, villas, domaines, reservations, personnel, personnelAffectations, chatMessages, chatCategorieEnum } from "@/db/schema";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { montantMenageDu, montantCuisineDu, estPayeParProprietaire } from "@/lib/personnel-tarifs";

const client = new Anthropic();

type ChatCategorie = (typeof chatCategorieEnum.enumValues)[number];
const CATEGORIES: ChatCategorie[] = ["menage_cuisine", "reservations", "maintenance", "caisse", "securite_documents", "urgent", "general"];

const tools: Tool[] = [
  {
    name: "record_cash_entry",
    description:
      "Enregistre un mouvement de caisse (dépense, loyer reçu, extra, argent confié, ou restitution). Appeler dès que Kamel décrit un mouvement d'argent clair, même en une phrase courte.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["depense", "loyer", "extra", "remise", "restitution"],
          description:
            "depense = argent donné/dépensé ; loyer = paiement de location reçu d'un client ; extra = recette annexe (petit-déj, options, caution retenue...) ; remise = argent confié à l'agence pour les dépenses courantes ; restitution = argent rendu à un client.",
        },
        montant: { type: "number", description: "Montant, toujours positif." },
        devise: { type: "string", enum: ["MAD", "EUR"], description: "Par défaut MAD si non précisé." },
        description: { type: "string", description: "Résumé court et clair du mouvement (qui, pourquoi)." },
        responsable: { type: "string", description: "Personne concernée (à qui donné, ou qui a payé), si connue." },
        villaNom: { type: "string", description: "Nom exact de la villa concernée si mentionnée, sinon omettre." },
        guestName: {
          type: "string",
          description:
            "Nom du client précis concerné par ce mouvement, si identifiable (ex. \"j'ai récupéré 40400 de Tawfik\", \"payé la cuisinière pour les Dupont\") — relie le mouvement à sa réservation, et pour un loyer met aussi à jour son montant payé. Omettre si aucun client précis n'est concerné (dépense générale, paiement personnel non lié à un séjour).",
        },
      },
      required: ["type", "montant", "description"],
    },
  },
  {
    name: "cancel_last_entry",
    description:
      "Annule/supprime le tout dernier mouvement de caisse enregistré par cet agent dans cette conversation (ex. Kamel dit \"non c'est faux\", \"annule\", \"erreur\"). N'annule jamais un mouvement plus ancien que le dernier.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_cash_summary",
    description: "Donne les totaux de la caisse (loyers reçus, argent confié, dépenses, restitutions, solde) par devise, depuis le début.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_reservation",
    description:
      "Cherche une ou plusieurs réservations par nom de client (et villa en option). Retourne dates, villa, statut de paiement, personnel affecté. Utiliser pour répondre à toute question sur qui est où, quand, ou combien un client a payé.",
    input_schema: {
      type: "object",
      properties: {
        guestName: { type: "string", description: "Nom (ou début de nom) du client." },
        villaNom: { type: "string", description: "Nom de la villa, si précisé, pour affiner la recherche." },
      },
      required: ["guestName"],
    },
  },
  {
    name: "mark_menage_done",
    description: "Confirme qu'un ménage a été fait pour une réservation donnée — équivalent à cocher \"fait\" dans l'app.",
    input_schema: {
      type: "object",
      properties: {
        personnelNom: { type: "string", description: "Prénom de la femme de ménage." },
        guestName: { type: "string", description: "Nom du client de la réservation concernée." },
        villaNom: { type: "string", description: "Villa concernée, si connue (aide à désambiguïser)." },
      },
      required: ["personnelNom", "guestName"],
    },
  },
  {
    name: "mark_staff_paid",
    description:
      "Marque une affectation (ménage ou cuisine) comme payée ET enregistre automatiquement la dépense correspondante en caisse (montant calculé selon le tarif, pas besoin de le donner). Utiliser quand Kamel dit avoir payé quelqu'un pour un ménage/une cuisine déjà fait(e).",
    input_schema: {
      type: "object",
      properties: {
        personnelNom: { type: "string", description: "Prénom de la personne payée." },
        guestName: { type: "string", description: "Nom du client de la réservation concernée." },
        villaNom: { type: "string", description: "Villa concernée, si connue (aide à désambiguïser)." },
      },
      required: ["personnelNom", "guestName"],
    },
  },
  {
    name: "get_personnel_summary",
    description: "Donne le total gagné et déjà reçu (depuis le début) pour une femme de ménage ou cuisinière donnée.",
    input_schema: {
      type: "object",
      properties: { personnelNom: { type: "string", description: "Son prénom." } },
      required: ["personnelNom"],
    },
  },
  {
    name: "update_villa_code",
    description: "Met à jour un code d'accès d'une villa (boîtier, porte d'entrée, chambre master, ou wifi).",
    input_schema: {
      type: "object",
      properties: {
        villaNom: { type: "string", description: "Nom exact de la villa." },
        champ: { type: "string", enum: ["boitier", "porte_entree", "chambre_master", "wifi"] },
        valeur: { type: "string", description: "Le nouveau code." },
      },
      required: ["villaNom", "champ", "valeur"],
    },
  },
  {
    name: "post_team_note",
    description:
      "Poste une note courte dans les Messages internes de l'app (visibles par toute l'équipe), pour signaler quelque chose sans détail sensible écrit. Utiliser seulement si Kamel demande explicitement de noter/signaler quelque chose à l'équipe.",
    input_schema: {
      type: "object",
      properties: {
        categorie: { type: "string", enum: CATEGORIES },
        message: { type: "string" },
        villaNom: { type: "string", description: "Villa concernée, si applicable." },
      },
      required: ["categorie", "message"],
    },
  },
];

function buildSystemPrompt(today: string, villasPromptList: string) {
  return `Tu es l'assistant personnel de Kamel sur Telegram, pour Moderna Agency (conciergerie de villas à Marrakech). Il te dicte des instructions (texte ou vocal transcrit) et tu agis directement dans l'application via tes outils. Ton seul interlocuteur est Kamel lui-même — jamais de client, jamais d'employé.

Date d'aujourd'hui : ${today}.

Villas connues (utilise le nom exact si Kamel en mentionne une, corrige les fautes/surnoms) :
- ${villasPromptList}

Ce que tu sais faire : mouvements de caisse (dépenses, loyers, extras...), consulter le solde de la caisse, chercher une réservation, confirmer un ménage fait, marquer quelqu'un payé (ménage/cuisine), consulter le total gagné/reçu d'une personne, changer un code de villa, poster une note à l'équipe.
Ce que tu NE fais PAS : fiches de police, création de réservations, modification du code de l'application — dis-le simplement si Kamel demande ça, sans essayer.

Règles :
- Réponds en français, ton bref et naturel, façon message Telegram (pas de pavés).
- Dès qu'une instruction est claire, agis directement (appelle l'outil) sans demander confirmation avant — mais confirme après coup ce que tu as fait, en une phrase claire, pour qu'il puisse corriger immédiatement si besoin.
- Si une information clé est ambiguë (montant, devise, quelle villa, quelle personne parmi plusieurs), demande une précision avant d'agir plutôt que de deviner — surtout pour tout ce qui touche à l'argent.
- Si Kamel corrige ou dit que c'est faux juste après un enregistrement de caisse, utilise cancel_last_entry puis ré-enregistre si les bonnes infos sont données.
- Devise par défaut MAD si rien n'est précisé et que le contexte est marocain (paiement personnel local) ; EUR seulement si explicitement mentionné ou évident (ex. "€").`;
}

async function getVillasPromptList(): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id));
  return rows.map((v) => `${v.nom} (n°${v.numero}${v.domaineNom ? `, ${v.domaineNom}` : ""})`).join("\n- ");
}

async function findVilla(villaNom: string | undefined): Promise<{ id: string; nom: string; numero: string } | null> {
  if (!villaNom) return null;
  const db = getDb();
  const rows = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas);
  return rows.find((v) => v.nom.toLowerCase() === villaNom.toLowerCase()) ?? null;
}

async function findReservationByGuestName(
  guestName: string | undefined
): Promise<{ id: string; guestName: string; montantPaye: string | null } | null> {
  if (!guestName) return null;
  const db = getDb();
  const [resa] = await db
    .select({ id: reservations.id, guestName: reservations.guestName, montantPaye: reservations.montantPaye })
    .from(reservations)
    .where(and(ilike(reservations.guestName, `%${guestName}%`), ne(reservations.status, "annulee")))
    .orderBy(desc(reservations.checkIn))
    .limit(1);
  return resa ?? null;
}

async function recordCashEntry(input: Record<string, unknown>) {
  const db = getDb();
  const villa = await findVilla(input.villaNom as string | undefined);
  const resa = await findReservationByGuestName(input.guestName as string | undefined);

  const [entry] = await db
    .insert(cashEntries)
    .values({
      villaId: villa?.id ?? null,
      reservationId: resa?.id ?? null,
      type: input.type as "depense" | "loyer" | "extra" | "remise" | "restitution",
      moyenPaiement: "especes",
      montant: String(input.montant),
      devise: (input.devise as string) || "MAD",
      description: String(input.description),
      responsable: (input.responsable as string) || null,
      photoUrls: [],
      createdByUserId: "telegram-agent",
      createdByName: "Kamel (Telegram)",
    })
    .returning();

  let reservationUpdate: string | null = null;
  if (input.type === "loyer" && resa) {
    const nouveauMontant = (Number(resa.montantPaye) || 0) + Number(input.montant);
    await db.update(reservations).set({ montantPaye: String(nouveauMontant) }).where(eq(reservations.id, resa.id));
    reservationUpdate = `Montant payé de ${resa.guestName} mis à jour : ${nouveauMontant} ${(input.devise as string) || "MAD"}.`;
  }

  return {
    ok: true,
    id: entry.id,
    type: entry.type,
    montant: entry.montant,
    devise: entry.devise,
    client: resa?.guestName ?? null,
    reservationUpdate,
  };
}

async function cancelLastEntry() {
  const db = getDb();
  const [last] = await db
    .select()
    .from(cashEntries)
    .where(eq(cashEntries.createdByUserId, "telegram-agent"))
    .orderBy(desc(cashEntries.createdAt))
    .limit(1);
  if (!last) return { ok: false, erreur: "Rien à annuler." };
  await db.delete(cashEntries).where(eq(cashEntries.id, last.id));
  return { ok: true, annule: { type: last.type, montant: last.montant, devise: last.devise, description: last.description } };
}

async function getCashSummary() {
  const db = getDb();
  const rows = (
    await db
      .select({ type: cashEntries.type, montant: cashEntries.montant, devise: cashEntries.devise, domaineNom: domaines.nom })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((r) => domaineEstActif(r.domaineNom));

  const devises = [...new Set(rows.map((r) => r.devise))];
  const summary: Record<string, Record<string, number>> = {};
  for (const dev of devises) {
    const enDev = rows.filter((r) => r.devise === dev);
    const sum = (t: string) => enDev.filter((r) => r.type === t).reduce((s, r) => s + Number(r.montant), 0);
    const remise = sum("remise");
    const depense = sum("depense");
    const restitution = sum("restitution");
    summary[dev] = { loyer: sum("loyer"), extra: sum("extra"), remise, depense, restitution, solde: remise - depense - restitution };
  }
  return summary;
}

async function findReservation(input: Record<string, unknown>) {
  const db = getDb();
  const villa = await findVilla(input.villaNom as string | undefined);
  const guestName = String(input.guestName ?? "");
  const rows = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      devisePaiement: reservations.devisePaiement,
      status: reservations.status,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(and(ilike(reservations.guestName, `%${guestName}%`), ne(reservations.status, "annulee"), villa ? eq(reservations.villaId, villa.id) : undefined))
    .orderBy(desc(reservations.checkIn))
    .limit(5);

  if (rows.length === 0) return { trouve: false };

  const reservationIds = rows.map((r) => r.id);
  const affectations = await db
    .select({ reservationId: personnelAffectations.reservationId, nom: personnel.nom, role: personnel.role })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(inArray(personnelAffectations.reservationId, reservationIds));
  const parReservation = new Map<string, { nom: string; role: string }[]>();
  for (const a of affectations) {
    const list = parReservation.get(a.reservationId) ?? [];
    list.push({ nom: a.nom, role: a.role });
    parReservation.set(a.reservationId, list);
  }

  return {
    trouve: true,
    reservations: rows.map((r) => ({
      guestName: r.guestName,
      villa: r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : null,
      checkIn: r.checkIn.toISOString().slice(0, 10),
      checkOut: r.checkOut.toISOString().slice(0, 10),
      loyerTotal: r.loyerTotal,
      montantPaye: r.montantPaye,
      devise: r.devisePaiement,
      personnel: parReservation.get(r.id) ?? [],
    })),
  };
}

async function findAffectation(personnelNom: string, guestName: string, villaNom: string | undefined) {
  const db = getDb();
  const villa = await findVilla(villaNom);
  const rows = await db
    .select({
      affectationId: personnelAffectations.id,
      faitAt: personnelAffectations.faitAt,
      payeAt: personnelAffectations.payeAt,
      nbJours: personnelAffectations.nbJours,
      avecDejeuner: personnelAffectations.avecDejeuner,
      role: personnel.role,
      personnelId: personnel.id,
      personnelNom: personnel.nom,
      reservationId: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      checkoutValideAt: reservations.checkoutValideAt,
      villaId: reservations.villaId,
      villaNom: villas.nom,
      personnelPayeParProprietaireNoms: villas.personnelPayeParProprietaireNoms,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .innerJoin(reservations, eq(reservations.id, personnelAffectations.reservationId))
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .where(
      and(
        ilike(personnel.nom, `%${personnelNom}%`),
        ilike(reservations.guestName, `%${guestName}%`),
        ne(reservations.status, "annulee"),
        villa ? eq(reservations.villaId, villa.id) : undefined
      )
    )
    .orderBy(desc(reservations.checkIn))
    .limit(1);
  return rows[0] ?? null;
}

async function markMenageDone(input: Record<string, unknown>) {
  const match = await findAffectation(String(input.personnelNom), String(input.guestName), input.villaNom as string | undefined);
  if (!match) return { ok: false, erreur: "Affectation introuvable — vérifie le prénom, le client et la villa." };
  const db = getDb();
  await db.update(personnelAffectations).set({ faitAt: new Date() }).where(eq(personnelAffectations.id, match.affectationId));
  return { ok: true, personnelNom: match.personnelNom, villaNom: match.villaNom, guestName: match.guestName };
}

async function markStaffPaid(input: Record<string, unknown>) {
  const match = await findAffectation(String(input.personnelNom), String(input.guestName), input.villaNom as string | undefined);
  if (!match) return { ok: false, erreur: "Affectation introuvable — vérifie le prénom, le client et la villa." };
  if (match.payeAt) return { ok: false, erreur: `${match.personnelNom} est déjà marquée payée pour ce séjour.` };
  if (estPayeParProprietaire(match.personnelPayeParProprietaireNoms ?? [], match.personnelNom)) {
    return { ok: false, erreur: `${match.personnelNom} est payée directement par le propriétaire pour cette villa, pas par l'agence.` };
  }

  const montant =
    match.role === "menage"
      ? montantMenageDu(match.faitAt, match.nbJours)
      : montantCuisineDu(match.nbJours, new Date(match.checkIn), new Date(match.checkOut), match.checkoutValideAt, match.avecDejeuner);
  if (montant <= 0) {
    return { ok: false, erreur: "Rien à payer pour l'instant (ménage pas encore confirmé fait, ou check-out pas encore validé pour la cuisine)." };
  }

  const db = getDb();
  const [entry] = await db
    .insert(cashEntries)
    .values({
      villaId: match.villaId,
      reservationId: match.reservationId,
      type: "depense",
      moyenPaiement: "especes",
      montant: montant.toFixed(2),
      devise: "MAD",
      description: `Paiement ${match.role === "menage" ? "ménage" : "cuisine"} — ${match.personnelNom} (${match.villaNom ?? "villa"})`,
      responsable: match.personnelNom,
      photoUrls: [],
      createdByUserId: "telegram-agent",
      createdByName: "Kamel (Telegram)",
    })
    .returning();
  // Lien conservé (comme markAffectationPaidSolo) pour que la dépense parte avec l'affectation
  // si elle est un jour retirée depuis l'app, au lieu de laisser une dépense fantôme en caisse.
  await db.update(personnelAffectations).set({ payeAt: new Date(), cashEntryId: entry.id }).where(eq(personnelAffectations.id, match.affectationId));
  return { ok: true, personnelNom: match.personnelNom, montant, villaNom: match.villaNom };
}

async function getPersonnelSummary(personnelNom: string) {
  const db = getDb();
  const matches = await db.select().from(personnel).where(ilike(personnel.nom, `%${personnelNom}%`));
  if (matches.length === 0) return { trouve: false };

  const results = [];
  for (const p of matches) {
    const affectations = await db
      .select({
        faitAt: personnelAffectations.faitAt,
        nbJours: personnelAffectations.nbJours,
        avecDejeuner: personnelAffectations.avecDejeuner,
        payeAt: personnelAffectations.payeAt,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        checkoutValideAt: reservations.checkoutValideAt,
      })
      .from(personnelAffectations)
      .innerJoin(reservations, eq(reservations.id, personnelAffectations.reservationId))
      .where(and(eq(personnelAffectations.personnelId, p.id), ne(reservations.status, "annulee")));

    let gagne = 0;
    let recu = 0;
    for (const a of affectations) {
      const montant =
        p.role === "menage"
          ? montantMenageDu(a.faitAt, a.nbJours)
          : montantCuisineDu(a.nbJours, new Date(a.checkIn), new Date(a.checkOut), a.checkoutValideAt, a.avecDejeuner);
      gagne += montant;
      if (a.payeAt) recu += montant;
    }
    results.push({ nom: p.nom, role: p.role, gagne, recu, du: gagne - recu });
  }
  return { trouve: true, resultats: results };
}

async function updateVillaCode(input: Record<string, unknown>) {
  const villa = await findVilla(input.villaNom as string);
  if (!villa) return { ok: false, erreur: "Villa introuvable." };
  const champMap: Record<string, "codeBoitier" | "codePorteEntree" | "codeChambreMaster" | "codeWifi"> = {
    boitier: "codeBoitier",
    porte_entree: "codePorteEntree",
    chambre_master: "codeChambreMaster",
    wifi: "codeWifi",
  };
  const champ = champMap[String(input.champ)];
  if (!champ) return { ok: false, erreur: "Champ inconnu." };
  const db = getDb();
  await db.update(villas).set({ [champ]: String(input.valeur) }).where(eq(villas.id, villa.id));
  return { ok: true, villaNom: villa.nom, champ: input.champ, valeur: input.valeur };
}

async function postTeamNote(input: Record<string, unknown>) {
  const villa = await findVilla(input.villaNom as string | undefined);
  const db = getDb();
  await db.insert(chatMessages).values({
    categorie: input.categorie as ChatCategorie,
    villaId: villa?.id ?? null,
    message: String(input.message),
    createdByUserId: "telegram-agent",
    createdByName: "Kamel (Telegram)",
  });
  return { ok: true };
}

export async function runAgentTurn(messages: MessageParam[]): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const villasPromptList = await getVillasPromptList();
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSystemPrompt(today, villasPromptList), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        const input = block.input as Record<string, unknown>;
        switch (block.name) {
          case "record_cash_entry":
            result = await recordCashEntry(input);
            break;
          case "cancel_last_entry":
            result = await cancelLastEntry();
            break;
          case "get_cash_summary":
            result = await getCashSummary();
            break;
          case "find_reservation":
            result = await findReservation(input);
            break;
          case "mark_menage_done":
            result = await markMenageDone(input);
            break;
          case "mark_staff_paid":
            result = await markStaffPaid(input);
            break;
          case "get_personnel_summary":
            result = await getPersonnelSummary(String(input.personnelNom));
            break;
          case "update_villa_code":
            result = await updateVillaCode(input);
            break;
          case "post_team_note":
            result = await postTeamNote(input);
            break;
          default:
            result = { erreur: "Outil inconnu" };
        }
      } catch (err) {
        console.error(`Échec outil ${block.name}:`, err);
        result = { erreur: "Un souci technique est survenu pendant cette action." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }
}

// Même logique que whatsapp-agent : un tool_use en fin d'historique sans tool_result associé
// (coupure réseau, timeout) casserait tout appel suivant à l'API si on ne le nettoie pas.
export function repairMessageHistory(messages: MessageParam[]): MessageParam[] {
  let lastValidEnd = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use")) {
      lastValidEnd = i;
    } else {
      break;
    }
  }
  return messages.slice(0, lastValidEnd);
}
