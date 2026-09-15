import type { ReactNode } from "react";
import { desc, isNotNull, eq } from "drizzle-orm";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { whatsappConversations, personnel, technicians, clients, reservations, villas } from "@/db/schema";
import { phonesMatch } from "@/lib/phone";
import { toRenderableParts, previewText } from "@/lib/whatsapp-message-content";
import { beds24GetMessages, type Beds24Message } from "@/lib/beds24/client";
import { PlatformBadge, WhatsAppBadge } from "@/components/app/platform-badge";
import { Beds24ReplyForm } from "@/components/app/beds24-reply-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Contact = { nom: string; roleLabel: string; roleVariant: "client" | "staff" | "technicien" | "inconnu" };

function resolveContact(
  phone: string,
  personnelList: { nom: string; telephone: string | null; role: string }[],
  techniciensList: { nom: string; telephone: string }[],
  clientsList: { nom: string; telephone: string | null }[],
  reservationsList: { guestName: string; guestPhone: string | null }[]
): Contact {
  const p = personnelList.find((x) => phonesMatch(x.telephone, phone));
  if (p) return { nom: p.nom, roleLabel: p.role === "menage" ? "Ménage" : "Cuisine", roleVariant: "staff" };

  const t = techniciensList.find((x) => phonesMatch(x.telephone, phone));
  if (t) return { nom: t.nom, roleLabel: "Technicien", roleVariant: "technicien" };

  const c = clientsList.find((x) => phonesMatch(x.telephone, phone));
  if (c) return { nom: c.nom, roleLabel: "Client", roleVariant: "client" };

  const r = reservationsList.find((x) => phonesMatch(x.guestPhone, phone));
  if (r) return { nom: r.guestName, roleLabel: "Client", roleVariant: "client" };

  return { nom: phone, roleLabel: "WhatsApp", roleVariant: "inconnu" };
}

// Kamel, 2026-09-15 : "en fond vert whatsapp qu'on reconnaisse !" — numéro non identifié
// (roleVariant "inconnu") a désormais son propre badge vert WhatsApp au lieu du badge gris
// générique utilisé pour les autres rôles.
function contactBadge(contact: Contact, className: string) {
  if (contact.roleVariant === "inconnu") return <WhatsAppBadge className={className} />;
  return <Badge className={cn(className, ROLE_BADGE_CLASS[contact.roleVariant])}>{contact.roleLabel}</Badge>;
}

const ROLE_BADGE_CLASS: Record<Contact["roleVariant"], string> = {
  client: "bg-accent text-accent-foreground",
  staff: "bg-secondary text-secondary-foreground",
  technicien: "bg-muted text-muted-foreground",
  inconnu: "bg-muted text-muted-foreground",
};

type ListItem = {
  key: string; // "wa:<phone>" ou "og:<reservationId>" (OTA guest)
  title: string;
  updatedAt: Date;
  preview: string;
  badge: ReactNode;
};

// Boîte de réception unifiée : toutes les conversations WhatsApp (clients ET personnel/techniciens,
// qui partagent la même table whatsapp_conversations) au même endroit, avec le contact identifié
// automatiquement plutôt qu'un simple numéro. Kamel, 2026-09-04 : "construit l'inbox whatsapp +
// mail" — le volet mail n'existe pas encore : aucune adresse n'est vérifiée sur Resend
// aujourd'hui, donc pas d'email entrant à afficher (voir le message envoyé après ce commit).
//
// Fils Airbnb/Booking.com ajoutés le 2026-09-15 (Kamel, en voyant les messages Airbnb dans
// Beds24 : "on peux les intégrer dans notre app moderna") — lecture seule pour l'instant, comme
// pour WhatsApp : répondre touche à un historique utilisé ailleurs comme contexte, à traiter
// séparément. Ne fonctionne que pour les réservations liées à un canal OTA via Beds24 (pas les
// résas "Direct", qui n'ont pas de fil de discussion côté Beds24).
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const { conv: selectedKeyParam } = await searchParams;
  const db = getDb();

  const [conversations, personnelList, techniciensList, clientsList, reservationsList, otaReservations] = await Promise.all([
    db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt)),
    db.select({ nom: personnel.nom, telephone: personnel.telephone, role: personnel.role }).from(personnel),
    db.select({ nom: technicians.nom, telephone: technicians.telephone }).from(technicians),
    db.select({ nom: clients.nom, telephone: clients.telephone }).from(clients),
    db.select({ guestName: reservations.guestName, guestPhone: reservations.guestPhone }).from(reservations).orderBy(desc(reservations.checkIn)),
    db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        canal: reservations.canal,
        beds24BookingId: reservations.beds24BookingId,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        updatedAt: reservations.updatedAt,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .where(isNotNull(reservations.beds24BookingId))
      .orderBy(desc(reservations.checkIn))
      .limit(30),
  ]);

  const enrichedWa = conversations.map((c) => ({
    ...c,
    contact: resolveContact(c.phone, personnelList, techniciensList, clientsList, reservationsList),
    messages: c.messages as { role: "user" | "assistant"; content: unknown }[],
  }));

  // Un appel API par réservation OTA — en pratique peu nombreuses tant que Beds24 n'est pas
  // généralisé à toutes les villas. Une erreur individuelle (résa trop ancienne, token expiré...)
  // ne doit jamais faire disparaître le reste de la boîte de réception.
  const otaResults = await Promise.allSettled(
    otaReservations.map((r) => beds24GetMessages(Number(r.beds24BookingId)))
  );
  const otaConversations = otaReservations
    .map((r, i) => {
      const result = otaResults[i];
      const messages: Beds24Message[] = result.status === "fulfilled" ? result.value : [];
      return { ...r, messages: [...messages].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()) };
    })
    .filter((c) => c.messages.length > 0);

  const listItems: ListItem[] = [
    ...enrichedWa.map((c) => ({
      key: `wa:${c.phone}`,
      title: c.contact.nom,
      updatedAt: new Date(c.updatedAt),
      preview: c.messages.length > 0 ? previewText(c.messages[c.messages.length - 1].content) : "",
      badge: contactBadge(c.contact, "shrink-0 text-[10px]"),
    })),
    ...otaConversations.map((c) => {
      const last = c.messages[c.messages.length - 1];
      return {
        key: `og:${c.id}`,
        title: c.guestName,
        updatedAt: new Date(last.time),
        preview: last.message,
        badge: <PlatformBadge canal={c.canal ?? "Direct"} className="shrink-0" />,
      };
    }),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const selectedKey = selectedKeyParam ?? listItems[0]?.key ?? null;
  const selectedWa = selectedKey?.startsWith("wa:") ? enrichedWa.find((c) => `wa:${c.phone}` === selectedKey) ?? null : null;
  const selectedOta = selectedKey?.startsWith("og:") ? otaConversations.find((c) => `og:${c.id}` === selectedKey) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Boîte de réception</h1>
        <p className="text-sm text-muted-foreground">
          Toutes les conversations WhatsApp (clients, ménage/cuisine, techniciens) et Airbnb/Booking.com au même endroit.
        </p>
      </div>

      <Card className="flex h-[calc(100vh-15rem)] min-h-[28rem] flex-row overflow-hidden p-0">
        <div className="flex w-full max-w-xs shrink-0 flex-col overflow-y-auto border-r border-border">
          {listItems.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucune conversation pour l&apos;instant.</p>
          ) : (
            listItems.map((item) => {
              const active = item.key === selectedKey;
              return (
                <Link
                  key={item.key}
                  href={`/inbox?conv=${encodeURIComponent(item.key)}`}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors",
                    active ? "bg-accent" : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(item.updatedAt, { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge}
                    <span className="truncate text-xs text-muted-foreground">{item.preview}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedWa ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="font-medium">{selectedWa.contact.nom}</span>
                {contactBadge(selectedWa.contact, "text-[10px]")}
                <span className="ml-auto text-xs text-muted-foreground">{selectedWa.phone}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selectedWa.messages.map((m, i) => {
                  const parts = toRenderableParts(m.content);
                  if (parts.length === 0) return null;
                  const fromContact = m.role === "user";
                  return (
                    <div key={i} className={cn("flex", fromContact ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[75%] space-y-1 rounded-2xl px-4 py-2 text-sm",
                          fromContact ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                        )}
                      >
                        {parts.map((p, j) =>
                          p.kind === "text" ? (
                            <p key={j} className="whitespace-pre-wrap">
                              {p.text}
                            </p>
                          ) : (
                            <p key={j} className={cn("text-xs italic opacity-80", fromContact ? "" : "text-primary-foreground/80")}>
                              🔧 {p.label}
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : selectedOta ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="font-medium">{selectedOta.guestName}</span>
                <PlatformBadge canal={selectedOta.canal ?? "Direct"} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedOta.villaNom} (n°{selectedOta.villaNumero})
                </span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selectedOta.messages.map((m) => {
                  const fromGuest = m.source === "guest";
                  return (
                    <div key={m.id} className={cn("flex", fromGuest ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[75%] space-y-1 rounded-2xl px-4 py-2 text-sm",
                          fromGuest ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Beds24ReplyForm reservationId={selectedOta.id} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Sélectionne une conversation.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
