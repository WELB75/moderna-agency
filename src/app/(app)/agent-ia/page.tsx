import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappConversations, staffAssignmentRequests, reservations, villas, personnel } from "@/db/schema";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonnelTabs } from "@/components/app/personnel-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneLink } from "@/components/app/phone-link";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };
type StoredMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

type Segment = { kind: "client" | "agent" | "outil"; text: string };

// Les conversations sont stockées au format brut de l'API Anthropic (voir whatsapp-agent/agent.ts) :
// un message "user" texte simple = vrai message du client ; un message "user" avec un tableau de
// blocs = un résultat d'outil interne (résultat de vérif dispo...), pas un vrai échange à afficher ;
// un message "assistant" contient des blocs texte (réponse envoyée au client) et/ou des appels
// d'outil (check_availability, create_booking) affichés en petit, pour la transparence sans noyer
// la vraie conversation.
function toSegments(messages: StoredMessage[]): Segment[] {
  const segments: Segment[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        segments.push({ kind: "client", text: m.content });
      }
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === "text" && block.text) {
          segments.push({ kind: "agent", text: block.text });
        } else if (block.type === "tool_use") {
          segments.push({ kind: "outil", text: `${block.name}(${JSON.stringify(block.input)})` });
        }
      }
    }
  }
  return segments;
}

const STATUT_LABEL: Record<string, { label: string; className: string }> = {
  en_recherche: { label: "En recherche", className: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  confirme: { label: "Confirmé", className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400" },
  sans_candidat: { label: "Sans candidat", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

const ROLE_LABEL: Record<string, string> = { menage: "Ménage", cuisine: "Cuisine" };

export default async function AgentIaPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { onglet } = await searchParams;
  const ongletActif = onglet === "personnel" ? "personnel" : "clients";

  const db = getDb();

  const conversations = await db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt));

  const staffRequests = await db
    .select({
      id: staffAssignmentRequests.id,
      role: staffAssignmentRequests.role,
      statut: staffAssignmentRequests.statut,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      candidatActuelId: staffAssignmentRequests.candidatActuelId,
      personnelConfirmeId: staffAssignmentRequests.personnelConfirmeId,
      updatedAt: staffAssignmentRequests.updatedAt,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      villaNom: villas.nom,
    })
    .from(staffAssignmentRequests)
    .leftJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .orderBy(desc(staffAssignmentRequests.updatedAt));

  const allPersonnel = await db.select({ id: personnel.id, nom: personnel.nom }).from(personnel);
  const nomParId = new Map(allPersonnel.map((p) => [p.id, p.nom]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent IA (WhatsApp)</h1>
        <p className="text-sm text-muted-foreground">
          Ce que les agents automatiques disent en ton nom — conversations clients et sollicitations envoyées au personnel.
        </p>
      </div>

      <PersonnelTabs defaultTab={ongletActif}>
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="clients" className="shrink-0">
            Conversations clients ({conversations.length})
          </TabsTrigger>
          <TabsTrigger value="personnel" className="shrink-0">
            Sollicitations personnel ({staffRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-3 pt-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune conversation client pour l&apos;instant.</p>
          ) : (
            conversations.map((c) => {
              const segments = toSegments((c.messages as StoredMessage[]) ?? []);
              return (
                <details key={c.id} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <PhoneLink phone={c.phone} />
                      <span className="text-xs text-muted-foreground">
                        {segments.filter((s) => s.kind !== "outil").length} message(s)
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Dernier échange {format(new Date(c.updatedAt), "d MMM yyyy HH:mm", { locale: fr })}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t p-4">
                    {segments.map((s, i) => (
                      <div
                        key={i}
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                          s.kind === "client" && "ml-0 bg-muted",
                          s.kind === "agent" && "ml-auto bg-primary/10",
                          s.kind === "outil" && "mx-auto max-w-full bg-transparent text-center font-mono text-xs text-muted-foreground"
                        )}
                      >
                        {s.kind !== "outil" ? (
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {s.kind === "client" ? "Client" : "Agent IA"}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{s.text}</p>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="personnel" className="space-y-2 pt-2">
          {staffRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune sollicitation pour l&apos;instant.</p>
          ) : (
            staffRequests.map((r) => {
              const statut = STATUT_LABEL[r.statut] ?? { label: r.statut, className: "" };
              const essayees = (r.candidatsEssayes as string[]) ?? [];
              return (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ROLE_LABEL[r.role] ?? r.role}</Badge>
                        <Badge variant="outline" className={statut.className}>
                          {statut.label}
                        </Badge>
                        <span className="text-sm font-medium">{r.villaNom ?? "Villa"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.guestName ?? "Réservation"} ·{" "}
                        {r.checkIn ? format(new Date(r.checkIn), "d MMM", { locale: fr }) : "?"} →{" "}
                        {r.checkOut ? format(new Date(r.checkOut), "d MMM yyyy", { locale: fr }) : "?"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.statut === "confirme" && r.personnelConfirmeId
                          ? `Confirmé : ${nomParId.get(r.personnelConfirmeId) ?? "?"}`
                          : r.statut === "en_recherche" && r.candidatActuelId
                            ? `En attente de réponse : ${nomParId.get(r.candidatActuelId) ?? "?"}`
                            : `${essayees.length} candidate(s) sollicitée(s), aucune disponible`}
                        {essayees.length > 1 ? ` (${essayees.map((id) => nomParId.get(id) ?? "?").join(", ")})` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.updatedAt), "d MMM yyyy HH:mm", { locale: fr })}
                    </span>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </PersonnelTabs>
    </div>
  );
}
