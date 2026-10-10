import { desc, isNotNull, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappConversations, personnel, technicians, clients, reservations, villas } from "@/db/schema";
import { phonesMatch } from "@/lib/phone";
import { toRenderableParts, previewText } from "@/lib/whatsapp-message-content";
import { beds24GetMessages, type Beds24Message } from "@/lib/beds24/client";
import { platformFromCanal } from "@/components/app/platform-badge";
import {
  InboxClient,
  type InboxChannel,
  type InboxConversation,
  type InboxMessage,
  type InboxStatus,
} from "./inbox-client";

// Boîte de réception reconstruite sur le modèle de la messagerie Superhote (liste à gauche avec
// recherche / filtre / statut du séjour / pastille de canal, conversation à droite) — Kamel,
// 2026-10-10 : "supprime tout, et tu mets un modèle pour avoir les messages whatsapp, airbnb et
// booking". Les sources de données sont inchangées : conversations WhatsApp (clients, personnel,
// techniciens) + fils Airbnb/Booking.com lus via Beds24 (réponse possible, voir Beds24ReplyForm).
// Pas de suivi "lu / non lu" en base : "À répondre" = le dernier message vient du voyageur.

type StayInfo = {
  reservationId: string;
  guestName: string;
  guestPhone: string | null;
  checkIn: Date;
  checkOut: Date;
  canal: string | null;
  villaNom: string | null;
  villaNumero: string | null;
};

const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

function stayRange(checkIn: Date, checkOut: Date) {
  const day = (d: Date) => String(d.getDate()).padStart(2, "0");
  const sameMonth = checkIn.getMonth() === checkOut.getMonth();
  return `${sameMonth ? day(checkIn) : DAY_MONTH.format(checkIn)} → ${DAY_MONTH.format(checkOut)}`;
}

function stayStatus(checkIn: Date, checkOut: Date, now: Date): { status: InboxStatus; label: string } {
  if (checkOut < now) return { status: "termine", label: "Séjour terminé" };
  if (checkIn > now) return { status: "a_venir", label: "Séjour à venir" };
  return { status: "en_cours", label: "Séjour en cours" };
}

function channelFromCanal(canal: string | null): InboxChannel {
  const p = platformFromCanal(canal ?? "Direct");
  return p === "airbnb" || p === "booking" ? p : "direct";
}

// Réservation la plus pertinente pour un numéro : séjour en cours, sinon le prochain à venir,
// sinon le plus récent terminé.
function pickStay(candidates: StayInfo[], now: Date): StayInfo | null {
  if (candidates.length === 0) return null;
  const current = candidates.find((s) => s.checkIn <= now && s.checkOut >= now);
  if (current) return current;
  const upcoming = candidates.filter((s) => s.checkIn > now).sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
  if (upcoming[0]) return upcoming[0];
  return [...candidates].sort((a, b) => b.checkOut.getTime() - a.checkOut.getTime())[0];
}

export async function MessagesBoiteReception({ selectedKeyParam }: { selectedKeyParam: string | undefined }) {
  const db = getDb();
  const now = new Date();

  const [conversations, personnelList, techniciensList, clientsList, stays, otaReservations] = await Promise.all([
    db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt)),
    db.select({ nom: personnel.nom, telephone: personnel.telephone, role: personnel.role }).from(personnel),
    db.select({ nom: technicians.nom, telephone: technicians.telephone }).from(technicians),
    db.select({ nom: clients.nom, telephone: clients.telephone }).from(clients),
    db
      .select({
        reservationId: reservations.id,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        canal: reservations.canal,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .orderBy(desc(reservations.checkIn)),
    db
      .select({
        id: reservations.id,
        beds24BookingId: reservations.beds24BookingId,
      })
      .from(reservations)
      .where(isNotNull(reservations.beds24BookingId))
      .orderBy(desc(reservations.checkIn))
      .limit(30),
  ]);

  // Un appel API par réservation OTA ; une erreur individuelle (résa trop ancienne, token
  // expiré...) ne doit jamais faire disparaître le reste de la boîte de réception.
  const otaResults = await Promise.allSettled(otaReservations.map((r) => beds24GetMessages(Number(r.beds24BookingId))));

  const staysById = new Map(stays.map((s) => [s.reservationId, s]));
  const items: InboxConversation[] = [];

  // --- WhatsApp : clients, personnel, techniciens
  for (const c of conversations) {
    const raw = c.messages as { role: "user" | "assistant"; content: unknown }[];
    const messages: InboxMessage[] = [];
    for (const m of raw) {
      for (const part of toRenderableParts(m.content)) {
        messages.push({
          fromContact: m.role === "user",
          text: part.kind === "text" ? part.text : `🔧 ${part.label}`,
          tool: part.kind === "tool",
          at: null,
        });
      }
    }
    const last = raw[raw.length - 1];

    const staff = personnelList.find((x) => phonesMatch(x.telephone, c.phone));
    const tech = techniciensList.find((x) => phonesMatch(x.telephone, c.phone));
    const client = clientsList.find((x) => phonesMatch(x.telephone, c.phone));
    const stay = pickStay(
      stays.filter((s) => phonesMatch(s.guestPhone, c.phone)),
      now
    );

    let name = c.phone;
    let status: InboxStatus = "autre";
    let statusLabel = "WhatsApp";
    if (staff) {
      name = staff.nom;
      statusLabel = staff.role === "menage" ? "Ménage" : "Cuisine";
    } else if (tech) {
      name = tech.nom;
      statusLabel = "Technicien";
    } else if (stay) {
      name = stay.guestName;
    } else if (client) {
      name = client.nom;
      statusLabel = "Client";
    }
    if (stay && !staff && !tech) {
      const s = stayStatus(stay.checkIn, stay.checkOut, now);
      status = s.status;
      statusLabel = s.label;
    }

    items.push({
      key: `wa:${c.phone}`,
      name,
      channel: "whatsapp",
      status,
      statusLabel,
      stay: stay && !staff && !tech ? stayRange(stay.checkIn, stay.checkOut) : null,
      logement: stay && !staff && !tech ? [stay.villaNom, stay.villaNumero ? `n°${stay.villaNumero}` : null].filter(Boolean).join(" ") : null,
      lastAt: new Date(c.updatedAt).toISOString(),
      preview: last ? previewText(last.content) : "",
      awaitingReply: last?.role === "user",
      messages: messages.slice(-100),
      phone: c.phone,
      reservationId: null,
    });
  }

  // --- Airbnb / Booking.com via Beds24
  otaReservations.forEach((r, i) => {
    const result = otaResults[i];
    if (result.status !== "fulfilled") return;
    const thread: Beds24Message[] = [...result.value].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    if (thread.length === 0) return;
    const stay = staysById.get(r.id);
    if (!stay) return;
    const last = thread[thread.length - 1];
    const s = stayStatus(stay.checkIn, stay.checkOut, now);
    items.push({
      key: `og:${r.id}`,
      name: stay.guestName,
      channel: channelFromCanal(stay.canal),
      status: s.status,
      statusLabel: s.label,
      stay: stayRange(stay.checkIn, stay.checkOut),
      logement: [stay.villaNom, stay.villaNumero ? `n°${stay.villaNumero}` : null].filter(Boolean).join(" ") || null,
      lastAt: new Date(last.time).toISOString(),
      preview: last.message,
      awaitingReply: last.source === "guest",
      messages: thread.map((m) => ({
        fromContact: m.source === "guest",
        text: m.message,
        at: m.time,
      })),
      phone: stay.guestPhone,
      reservationId: r.id,
    });
  });

  items.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  return <InboxClient conversations={items} initialKey={selectedKeyParam ?? null} />;
}
