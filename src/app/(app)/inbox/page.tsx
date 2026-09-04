import { desc } from "drizzle-orm";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { whatsappConversations, personnel, technicians, clients, reservations } from "@/db/schema";
import { phonesMatch } from "@/lib/phone";
import { toRenderableParts, previewText } from "@/lib/whatsapp-message-content";
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

  return { nom: phone, roleLabel: "Numéro inconnu", roleVariant: "inconnu" };
}

const ROLE_BADGE_CLASS: Record<Contact["roleVariant"], string> = {
  client: "bg-accent text-accent-foreground",
  staff: "bg-secondary text-secondary-foreground",
  technicien: "bg-muted text-muted-foreground",
  inconnu: "bg-muted text-muted-foreground",
};

// Boîte de réception unifiée : toutes les conversations WhatsApp (clients ET personnel/techniciens,
// qui partagent la même table whatsapp_conversations) au même endroit, avec le contact identifié
// automatiquement plutôt qu'un simple numéro. Kamel, 2026-09-04 : "construit l'inbox whatsapp +
// mail" — le volet mail n'existe pas encore : aucune adresse n'est vérifiée sur Resend
// aujourd'hui, donc pas d'email entrant à afficher (voir le message envoyé après ce commit).
// Lecture seule pour l'instant : répondre depuis ici touchera à l'historique que l'agent IA
// utilise comme contexte de conversation, à traiter séparément avec plus de précaution.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone: selectedPhoneParam } = await searchParams;
  const db = getDb();

  const [conversations, personnelList, techniciensList, clientsList, reservationsList] = await Promise.all([
    db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt)),
    db.select({ nom: personnel.nom, telephone: personnel.telephone, role: personnel.role }).from(personnel),
    db.select({ nom: technicians.nom, telephone: technicians.telephone }).from(technicians),
    db.select({ nom: clients.nom, telephone: clients.telephone }).from(clients),
    db.select({ guestName: reservations.guestName, guestPhone: reservations.guestPhone }).from(reservations).orderBy(desc(reservations.checkIn)),
  ]);

  const enriched = conversations.map((c) => ({
    ...c,
    contact: resolveContact(c.phone, personnelList, techniciensList, clientsList, reservationsList),
    messages: c.messages as { role: "user" | "assistant"; content: unknown }[],
  }));

  const selectedPhone = selectedPhoneParam ?? enriched[0]?.phone ?? null;
  const selected = enriched.find((c) => c.phone === selectedPhone) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Boîte de réception</h1>
        <p className="text-sm text-muted-foreground">
          Toutes les conversations WhatsApp (clients, ménage/cuisine, techniciens) au même endroit.
        </p>
      </div>

      <Card className="flex h-[calc(100vh-15rem)] min-h-[28rem] flex-row overflow-hidden p-0">
        <div className="flex w-full max-w-xs shrink-0 flex-col overflow-y-auto border-r border-border">
          {enriched.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucune conversation pour l&apos;instant.</p>
          ) : (
            enriched.map((c) => {
              const active = c.phone === selectedPhone;
              const last = c.messages[c.messages.length - 1];
              return (
                <Link
                  key={c.id}
                  href={`/inbox?phone=${encodeURIComponent(c.phone)}`}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors",
                    active ? "bg-accent" : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.contact.nom}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("shrink-0 text-[10px]", ROLE_BADGE_CLASS[c.contact.roleVariant])}>
                      {c.contact.roleLabel}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">{last ? previewText(last.content) : ""}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Sélectionne une conversation.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="font-medium">{selected.contact.nom}</span>
                <Badge className={cn("text-[10px]", ROLE_BADGE_CLASS[selected.contact.roleVariant])}>
                  {selected.contact.roleLabel}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">{selected.phone}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selected.messages.map((m, i) => {
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
          )}
        </div>
      </Card>
    </div>
  );
}
