import { and, asc, desc, eq, gte, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { domaines, reservations, telegramConversations, villas } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { formatUtcTime, nowInMorocco } from "@/lib/now";
import { villaLabel } from "@/lib/whatsapp-agent/staff";

// Rappels Telegram de Kamel (cron /api/telegram-rappels) : le matin pour la journée qui commence,
// le soir pour le lendemain — Kamel, 2026-10-24 : "tous les matins et tous les soirs [...] un
// rappel sur les réservations des villas, les check-ins et les check-outs", pour être au courant
// sans ouvrir l'application. Texte brut, sans emoji.

export type MomentRappel = "matin" | "soir";

type Ligne = {
  villa: string;
  heure: string;
  client: string;
  personnes: number | null;
  canal: string | null;
  notes: string | null;
};

async function chatIdDeKamel(): Promise<string | null> {
  // Conversation privée : l'id du chat est celui de l'utilisateur, donc TELEGRAM_ALLOWED_USER_ID
  // convient tel quel. Sans lui, on prend la dernière conversation connue du bot (Kamel seul).
  const allowed = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (allowed) return allowed;
  const [row] = await getDb()
    .select({ chatId: telegramConversations.chatId })
    .from(telegramConversations)
    .orderBy(desc(telegramConversations.updatedAt))
    .limit(1);
  return row?.chatId ?? null;
}

function formatLigne(l: Ligne): string {
  const details = [
    l.personnes ? `${l.personnes} pers.` : null,
    l.canal,
  ].filter(Boolean);
  let out = `- ${l.villa} à ${l.heure} : ${l.client}${details.length ? ` (${details.join(", ")})` : ""}`;
  if (l.notes) out += `\n  Note : ${l.notes.replace(/\s+/g, " ").trim()}`;
  return out;
}

function section(titre: string, lignes: Ligne[], vide: string): string {
  if (lignes.length === 0) return `${titre}\n${vide}`;
  return `${titre} (${lignes.length})\n${lignes.map(formatLigne).join("\n")}`;
}

export async function construireRappel(moment: MomentRappel, maintenant: Date = nowInMorocco()): Promise<string> {
  // Les dates de check-in/check-out sont stockées en heure locale marocaine posée telle quelle
  // en UTC (voir now.ts) : on borne donc le jour avec les composants UTC de nowInMorocco().
  const decalage = moment === "soir" ? 1 : 0;
  const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + decalage));
  const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);

  const db = getDb();
  const colonnes = {
    villaNom: villas.nom,
    villaNumero: villas.numero,
    domaineNom: domaines.nom,
    client: reservations.guestName,
    personnes: reservations.guestsCount,
    canal: reservations.canal,
    notes: reservations.notes,
  };
  const charger = (colonneDate: typeof reservations.checkIn | typeof reservations.checkOut) =>
    db
      .select({ ...colonnes, date: colonneDate })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(ne(reservations.status, "annulee"), gte(colonneDate, debut), lt(colonneDate, fin)))
      .orderBy(asc(colonneDate));

  const [arrivees, departs] = await Promise.all([charger(reservations.checkIn), charger(reservations.checkOut)]);

  const versLigne = (r: (typeof arrivees)[number]): Ligne => ({
    villa: villaLabel(r.villaNom ?? "Villa", r.villaNumero ?? null),
    heure: formatUtcTime(r.date),
    client: r.client,
    personnes: r.personnes,
    canal: r.canal,
    notes: r.notes,
  });
  const gerees = <T extends { villaNom: string | null; domaineNom: string | null }>(rows: T[]) =>
    rows.filter((r) => domaineEstActif(r.domaineNom) && villaEstGeree(r.villaNom ?? ""));

  const jour = debut.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const entete = moment === "matin" ? `Rappel du matin - ${jour}` : `Rappel du soir - demain, ${jour}`;

  return [
    entete,
    section("Check-ins", gerees(arrivees).map(versLigne), "Aucune arrivée."),
    section("Check-outs", gerees(departs).map(versLigne), "Aucun départ."),
  ].join("\n\n");
}

export async function envoyerRappelTelegram(moment: MomentRappel): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: false, reason: "TELEGRAM_BOT_TOKEN manquant" };
  const chatId = await chatIdDeKamel();
  if (!chatId) return { sent: false, reason: "chat Telegram inconnu (écrire une fois au bot)" };

  const text = await construireRappel(moment);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Échec envoi rappel Telegram:", res.status, detail);
    return { sent: false, reason: `Telegram ${res.status}` };
  }
  return { sent: true };
}
