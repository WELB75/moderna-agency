import { and, asc, desc, eq, gte, ilike, isNotNull, lte, ne, or } from "drizzle-orm";
import { addDays, subDays } from "date-fns";
import { getDb } from "@/db";
import { whatsappConversations, personnel, technicians, clients, reservations, villas } from "@/db/schema";
import { inboxReads } from "@/db/schema-recaps";
import { phonesMatch } from "@/lib/phone";
import { toRenderableParts, previewText } from "@/lib/whatsapp-message-content";
import { beds24GetBookings, beds24GetMessagesBulk, Beds24ConfigError, type Beds24Message } from "@/lib/beds24/client";
import { normaliseCanal } from "@/lib/canal";
import { chargerMessagesAgence, FENETRE_24H_MS } from "@/lib/whatsapp-agence";
import { InboxClient, type InboxConversation, type InboxMessage, type InboxStatus } from "./inbox-client";

// Boîte de réception reconstruite sur le modèle de la messagerie Superhote (liste à gauche avec
// recherche / filtre / statut du séjour / pastille de canal, conversation à droite) — Kamel,
// 2026-10-10 : "supprime tout, et tu mets un modèle pour avoir les messages whatsapp, airbnb et
// booking". Les sources de données sont inchangées : conversations WhatsApp (clients, personnel,
// techniciens) + fils Airbnb lus via Beds24 (réponse possible, voir Beds24ReplyForm).
// Pas de suivi "lu / non lu" en base : "À répondre" = le dernier message vient du voyageur.
//
// Airbnb (re)branché le 2026-10-13, après la bascule SuperHote → Beds24 : il avait été retiré le
// 2026-10-10 ("retire airbnb car c lié à mon compte"), il revient à la demande de la direction
// maintenant que les réservations Airbnb arrivent par Beds24. Booking.com : pas ce soir
// ("bientôt" dans le filtre). Beds24 en panne / token absent = la boîte WhatsApp s'affiche quand
// même, avec une petite note — jamais d'erreur de page.

// Fenêtre de séjours dont on lit les fils Airbnb, et garde-fous pour rester rapide et ne pas
// épuiser le quota d'appels Beds24 (les messages sont lus en appels groupés, voir chargerFilsAirbnb).
const AIRBNB_JOURS_AVANT = 30;
const AIRBNB_JOURS_APRES = 120;
const AIRBNB_MAX_FILS = 80;
const DEMANDES_MAX = 40;
const BEDS24_TIMEOUT_MS = 8000;
const BEDS24_BUDGET_MS = 12000;

class Beds24TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Beds24TimeoutError("Beds24 ne répond pas.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Horodatage Beds24 illisible => 0 plutôt qu'une "Invalid Date" qui ferait planter toISOString().
function horodatage(time: string | null | undefined): number {
  const t = time ? new Date(time).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

type AirbnbResa = {
  id: string;
  canal: string | null;
  beds24BookingId: string | null;
  guestName: string;
  guestPhone: string | null;
  checkIn: Date;
  checkOut: Date;
  villaNom: string | null;
  villaNumero: string | null;
};

// Séjours en cours d'abord, puis les prochains à venir, puis les plus récemment terminés.
function prioriteSejour(r: AirbnbResa, now: Date): [number, number] {
  if (r.checkIn <= now && r.checkOut >= now) return [0, r.checkIn.getTime()];
  if (r.checkIn > now) return [1, r.checkIn.getTime()];
  return [2, -r.checkOut.getTime()];
}

// Fils Airbnb / Booking.com via Beds24 : TOUS les fils en un ou deux appels groupés
// (beds24GetMessagesBulk), au lieu d'un appel par réservation qui épuisait le quota Beds24
// (2026-10-13). Délai max global ; en échec, aucune conversation n'est chargée et une note
// s'affiche au-dessus de la liste.
async function chargerFilsAirbnb(
  resas: AirbnbResa[]
): Promise<{ fils: Map<string, Beds24Message[]>; echecs: number; injoignable: boolean }> {
  const fils = new Map<string, Beds24Message[]>();
  const cibles = resas.filter((r) => Number.isFinite(Number(r.beds24BookingId)) && Number(r.beds24BookingId) > 0);
  if (cibles.length === 0) return { fils, echecs: 0, injoignable: false };

  try {
    const parResa = await withTimeout(
      beds24GetMessagesBulk(cibles.map((r) => Number(r.beds24BookingId))),
      BEDS24_BUDGET_MS
    );
    for (const r of cibles) fils.set(r.id, parResa.get(Number(r.beds24BookingId)) ?? []);
    return { fils, echecs: 0, injoignable: false };
  } catch (error) {
    if (!(error instanceof Beds24ConfigError || error instanceof Beds24TimeoutError)) {
      console.error("[boite-reception] Beds24 :", error);
    }
    return { fils, echecs: cibles.length, injoignable: true };
  }
}

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
  const { items, notice } = await chargerBoiteReception();
  return <InboxClient conversations={items} initialKey={selectedKeyParam ?? null} notice={notice} />;
}

// Chargement des conversations, séparé du rendu pour que la pastille "Messages" du menu
// (/api/messages/a-repondre) compte exactement les mêmes conversations que la boîte de réception.
export async function chargerBoiteReception(): Promise<{ items: InboxConversation[]; notice: string | null }> {
  const db = getDb();
  const now = new Date();

  const [conversations, personnelList, techniciensList, clientsList, stays] = await Promise.all([
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
  ]);

  // --- Airbnb via Beds24 : tout ce bloc est isolé, une erreur (base, API, token) ne fait
  // qu'afficher une note au-dessus de la liste.
  let airbnbResas: AirbnbResa[] = [];
  let filsAirbnb = new Map<string, Beds24Message[]>();
  let notice: string | null = null;
  try {
    // canal ILIKE '%airbnb%' : couvre "Airbnb" (Beds24) comme "airbnb" / "Airbnb.com" (anciens
    // imports), même règle que normaliseCanal (lib/canal.ts).
    const candidates: AirbnbResa[] = await db
      .select({
        id: reservations.id,
        canal: reservations.canal,
        beds24BookingId: reservations.beds24BookingId,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .where(
        and(
          isNotNull(reservations.beds24BookingId),
          // Airbnb ET Booking.com (2026-10-13) : Beds24 relaie la messagerie des deux plateformes,
          // avec la même API (bookings/messages) une fois la propriété connectée au canal.
          or(ilike(reservations.canal, "%airbnb%"), ilike(reservations.canal, "booking%"), ilike(reservations.canal, "%booking.com%")),
          ne(reservations.status, "annulee"),
          gte(reservations.checkOut, subDays(now, AIRBNB_JOURS_AVANT)),
          lte(reservations.checkIn, addDays(now, AIRBNB_JOURS_APRES))
        )
      )
      .orderBy(asc(reservations.checkIn))
      .limit(200);

    airbnbResas = candidates
      .sort((a, b) => {
        const [pa, ta] = prioriteSejour(a, now);
        const [pb, tb] = prioriteSejour(b, now);
        return pa - pb || ta - tb;
      })
      .slice(0, AIRBNB_MAX_FILS);

    const resultat = await chargerFilsAirbnb(airbnbResas);
    filsAirbnb = resultat.fils;
    if (resultat.injoignable) {
      notice = "Messages Airbnb / Booking.com indisponibles pour le moment (Beds24 injoignable) — WhatsApp reste à jour.";
    } else if (resultat.echecs > 0) {
      notice = `${resultat.echecs} conversation${resultat.echecs > 1 ? "s" : ""} Airbnb / Booking.com non chargée${resultat.echecs > 1 ? "s" : ""} (Beds24).`;
    }
  } catch (error) {
    console.error("[boite-reception] Airbnb/Beds24 :", error);
    notice = "Messages Airbnb indisponibles pour le moment — WhatsApp reste à jour.";
  }

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

  // --- Ligne WhatsApp Business de l'agence (coexistence téléphone + app) : bloc isolé, une erreur
  // de lecture ne casse pas le reste de la boîte.
  try {
    const parContact = await chargerMessagesAgence();
    for (const [phone, liste] of parContact) {
      const last = liste[liste.length - 1];
      const dernierEntrant = [...liste].reverse().find((m) => m.sens === "entrant");
      const staff = personnelList.find((x) => phonesMatch(x.telephone, phone));
      const tech = techniciensList.find((x) => phonesMatch(x.telephone, phone));
      const client = clientsList.find((x) => phonesMatch(x.telephone, phone));
      const stay = pickStay(
        stays.filter((s) => phonesMatch(s.guestPhone, phone)),
        now
      );
      let name = phone;
      let status: InboxStatus = "autre";
      let statusLabel = "WhatsApp agence";
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
      const sejour = stay && !staff && !tech ? stay : null;
      if (sejour) {
        const s = stayStatus(sejour.checkIn, sejour.checkOut, now);
        status = s.status;
        statusLabel = s.label;
      }
      items.push({
        key: `ag:${phone}`,
        name,
        channel: "whatsapp",
        status,
        statusLabel,
        stay: sejour ? stayRange(sejour.checkIn, sejour.checkOut) : null,
        logement: sejour ? [sejour.villaNom, sejour.villaNumero ? `n°${sejour.villaNumero}` : null].filter(Boolean).join(" ") : null,
        lastAt: last.at.toISOString(),
        preview: last.contenu,
        awaitingReply: last.sens === "entrant",
        messages: liste.slice(-100).map((m) => ({ fromContact: m.sens === "entrant", text: m.contenu, at: m.at.toISOString() })),
        phone,
        reservationId: null,
        ligneAgence: { fenetreOuverte: Boolean(dernierEntrant && now.getTime() - dernierEntrant.at.getTime() < FENETRE_24H_MS) },
      });
    }
  } catch (error) {
    console.error("[boite-reception] ligne WhatsApp agence :", error);
  }

  // --- Airbnb via Beds24 (Booking.com : bientôt)
  for (const r of airbnbResas) {
    const raw = filsAirbnb.get(r.id);
    if (!raw || raw.length === 0) continue;
    const thread: Beds24Message[] = [...raw].sort((a, b) => horodatage(a.time) - horodatage(b.time));
    const last = thread[thread.length - 1];
    const s = stayStatus(r.checkIn, r.checkOut, now);
    items.push({
      key: `og:${r.id}`,
      name: r.guestName,
      channel: normaliseCanal(r.canal) === "booking" ? "booking" : "airbnb",
      status: s.status,
      statusLabel: s.label,
      stay: stayRange(r.checkIn, r.checkOut),
      logement: [r.villaNom, r.villaNumero ? `n°${r.villaNumero}` : null].filter(Boolean).join(" ") || null,
      lastAt: new Date(horodatage(last.time)).toISOString(),
      preview: last.message ?? "",
      awaitingReply: last.source === "guest",
      messages: thread.map((m) => ({
        fromContact: m.source === "guest",
        text: m.message ?? "",
        at: horodatage(m.time) ? m.time : null,
      })),
      phone: r.guestPhone,
      reservationId: r.id,
    });
  }

  // --- Demandes d'information Airbnb (2026-10-13, "Enquêtes et demandes" passé sur "Importer
  // tout" dans Beds24) : pas encore de réservation, donc rien dans `reservations` — on les lit
  // directement dans Beds24 (statut inquiry/request), sur les seuls logements reliés à nos villas.
  // Bloc isolé comme le précédent : une panne Beds24 n'empêche pas le reste de s'afficher.
  try {
    const villasBeds24 = await db
      .select({ roomId: villas.beds24RoomId, nom: villas.nom, numero: villas.numero })
      .from(villas)
      .where(isNotNull(villas.beds24RoomId));
    const villaParRoom = new Map(villasBeds24.map((v) => [Number(v.roomId), v]));
    {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const demandes = (
        await withTimeout(
          beds24GetBookings({
            status: ["inquiry", "request"],
            arrivalFrom: iso(subDays(now, 2)),
            arrivalTo: iso(addDays(now, 365)),
          }),
          BEDS24_TIMEOUT_MS
        )
      )
        // Les plus récentes d'abord : Beds24 les renvoie par id croissant, donc une simple coupe
        // gardait les plus anciennes et masquait les nouvelles demandes. Les logements non reliés
        // à une villa de l'app restent affichés (sans nom de villa) au lieu d'être écartés en
        // silence — Kamel, 2026-10-13 : "les demandes d'infos je les ai pas dans la boîte".
        .sort((a, b) => b.id - a.id)
        .slice(0, DEMANDES_MAX);

      // Un seul appel groupé pour tous les fils. S'il échoue, les demandes restent affichées
      // (avec un aperçu générique) au lieu de disparaître de la boîte.
      const filsDemandes = await withTimeout(beds24GetMessagesBulk(demandes.map((b) => b.id)), BEDS24_BUDGET_MS).catch(
        (error: unknown) => {
          if (!(error instanceof Beds24ConfigError || error instanceof Beds24TimeoutError)) {
            console.error("[boite-reception] messages des demandes Beds24 :", error);
          }
          return new Map<number, Beds24Message[]>();
        }
      );
      demandes.forEach((b) => {
        const thread = [...(filsDemandes.get(b.id) ?? [])].sort((x, y) => horodatage(x.time) - horodatage(y.time));
        const last: Beds24Message | undefined = thread[thread.length - 1];
        const villa = villaParRoom.get(Number(b.roomId));
        const checkIn = new Date(`${b.arrival}T00:00:00Z`);
        const checkOut = new Date(`${b.departure}T00:00:00Z`);
        const estBooking = normaliseCanal(b.referer ?? b.channel ?? null) === "booking";
        const nom = [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || (estBooking ? "Voyageur Booking.com" : "Voyageur Airbnb");
        items.push({
          key: `og:b24-${b.id}`,
          name: nom,
          channel: estBooking ? "booking" : "airbnb",
          status: "autre",
          statusLabel: "Demande d'information",
          stay: stayRange(checkIn, checkOut),
          logement: villa ? [villa.nom, villa.numero ? `n°${villa.numero}` : null].filter(Boolean).join(" ") : "Logement non relié dans l'app",
          // Fil non chargé (Beds24 lent) : la demande reste visible, datée de sa création.
          lastAt: new Date(
            horodatage(last?.time) || horodatage(b.modifiedTime) || horodatage(b.bookingTime) || now.getTime()
          ).toISOString(),
          preview: last ? (last.message ?? "") : "Demande d'information — ouvrez pour répondre",
          awaitingReply: last ? last.source === "guest" : true,
          messages: thread.map((m) => ({
            fromContact: m.source === "guest",
            text: m.message ?? "",
            at: horodatage(m.time) ? m.time : null,
          })),
          phone: b.phone || b.mobile || null,
          reservationId: null,
          beds24InquiryId: b.id,
        });
      });
    }
  } catch (error) {
    if (!(error instanceof Beds24ConfigError || error instanceof Beds24TimeoutError)) {
      console.error("[boite-reception] demandes Airbnb/Beds24 :", error);
    }
  }

  items.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  // Non lu = le voyageur a écrit en dernier ET la conversation n'a pas été ouverte depuis ce message.
  const lectures = new Map((await db.select().from(inboxReads)).map((r) => [r.convKey, r.readAt.getTime()]));
  for (const c of items) {
    c.unread = c.awaitingReply && new Date(c.lastAt).getTime() > (lectures.get(c.key) ?? 0);
  }

  return { items, notice };
}
