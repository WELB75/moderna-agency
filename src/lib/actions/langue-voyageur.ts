"use server";

import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, whatsappConversations, whatsappOutboundMessages } from "@/db/schema";
import { beds24GetMessages } from "@/lib/beds24/client";
import { phonesMatch } from "@/lib/phone";
import { toRenderableParts } from "@/lib/whatsapp-message-content";
import { detecterLangue, langueMessage, NOMS_LANGUES, type LangueDetectee } from "@/lib/langue-voyageur";

// Langue d'un voyageur d'après ses messages (Fouad, 2026-10-31) : lue au moment du clic sur
// « Message d'arrivée » (et les autres modèles), pour envoyer en anglais à qui écrit en anglais
// sans avoir à choisir à la main. Sources, de la plus fiable à la moins fiable :
// 1. le fil Airbnb / Booking.com de la réservation (Beds24, messages `source: "guest"`) ;
// 2. ce que le numéro du voyageur a écrit sur la ligne WhatsApp de l'agence
//    (whatsapp_outbound_messages, sens « entrant ») et à l'agent WhatsApp (whatsapp_conversations) ;
// 3. la langue choisie sur une fiche police déjà ouverte n'est pas utilisée ici : elle n'est
//    écrite qu'une fois la fiche complète (voir gendarmerie-progressif.ts).

export type LangueVoyageur = {
  langue: LangueDetectee | null;
  // Langue de modèle de message à utiliser (fr/en).
  messageLang: "fr" | "en";
  source: "airbnb" | "whatsapp" | null;
  nbMessages: number;
  // Phrase courte pour le toast : « anglais, d'après 4 messages Airbnb ».
  explication: string | null;
};

const AUCUNE: LangueVoyageur = { langue: null, messageLang: "fr", source: null, nbMessages: 0, explication: null };

async function textesBeds24(bookingId: string | null): Promise<string[]> {
  const id = bookingId ? Number(bookingId) : NaN;
  if (!Number.isFinite(id)) return [];
  try {
    const messages = await beds24GetMessages(id);
    return messages
      .filter((m) => m.source === "guest" && m.message?.trim())
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((m) => m.message);
  } catch (err) {
    console.error("Langue voyageur : lecture des messages Beds24 impossible", err);
    return [];
  }
}

async function textesWhatsApp(guestPhone: string | null): Promise<string[]> {
  if (!guestPhone) return [];
  const db = getDb();
  const fin = guestPhone.replace(/\D/g, "").slice(-9);
  if (fin.length !== 9) return [];
  const textes: string[] = [];

  // Ligne WhatsApp de l'agence : messages entrants de ce numéro (filtre SQL sur la fin du numéro,
  // puis vérification stricte phonesMatch).
  const entrants = await db
    .select({ destinataire: whatsappOutboundMessages.destinataire, contenu: whatsappOutboundMessages.contenu, createdAt: whatsappOutboundMessages.createdAt })
    .from(whatsappOutboundMessages)
    .where(and(eq(whatsappOutboundMessages.sens, "entrant"), sql`${whatsappOutboundMessages.destinataire} like ${"%" + fin}`))
    .orderBy(asc(whatsappOutboundMessages.createdAt))
    .limit(50);
  for (const m of entrants) if (phonesMatch(m.destinataire, guestPhone) && m.contenu.trim()) textes.push(m.contenu);

  // Agent WhatsApp : rôle "user" = le contact.
  const convs = await db
    .select({ phone: whatsappConversations.phone, messages: whatsappConversations.messages })
    .from(whatsappConversations)
    .where(sql`${whatsappConversations.phone} like ${"%" + fin}`)
    .limit(3);
  for (const c of convs) {
    if (!phonesMatch(c.phone, guestPhone)) continue;
    for (const m of c.messages as { role?: string; content?: unknown }[]) {
      if (m?.role !== "user") continue;
      const texte = toRenderableParts(m.content)
        .map((p) => (p.kind === "text" ? p.text : ""))
        .join(" ")
        .trim();
      if (texte) textes.push(texte);
    }
  }
  return textes;
}

export async function detecterLangueVoyageur(reservationId: string): Promise<LangueVoyageur> {
  await auth.protect();
  const db = getDb();
  const [r] = await db
    .select({ guestPhone: reservations.guestPhone, beds24BookingId: reservations.beds24BookingId })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return AUCUNE;

  const [airbnb, whatsapp] = await Promise.all([textesBeds24(r.beds24BookingId), textesWhatsApp(r.guestPhone)]);

  for (const [source, textes] of [
    ["airbnb", airbnb],
    ["whatsapp", whatsapp],
  ] as const) {
    const resultat = detecterLangue(textes);
    if (!resultat) continue;
    const ou = source === "airbnb" ? "Airbnb/Booking" : "WhatsApp";
    return {
      langue: resultat.langue,
      messageLang: langueMessage(resultat.langue),
      source,
      nbMessages: resultat.nbMessages,
      explication: `${NOMS_LANGUES[resultat.langue]}, d'après ${resultat.nbMessages} message${resultat.nbMessages > 1 ? "s" : ""} ${ou}`,
    };
  }
  return AUCUNE;
}
