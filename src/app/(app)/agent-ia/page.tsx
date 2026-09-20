import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  whatsappConversations,
  staffAssignmentRequests,
  maintenanceConversations,
  interventions,
  technicians,
  reservations,
  villas,
  personnel,
  whatsappOutboundMessages,
} from "@/db/schema";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonnelTabs } from "@/components/app/personnel-tabs";
import { Badge } from "@/components/ui/badge";
import { PhoneLink } from "@/components/app/phone-link";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type ContentBlock = { type: string; text?: string; name?: string; input?: unknown };
type StoredMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

type Segment = { kind: "client" | "agent" | "outil"; text: string };

type HistoriqueEntry = { at: string; type: "offre" | "reponse" | "relance"; candidatNom: string; texte: string };

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

// Statut réel de livraison renvoyé par Meta (voir whatsappOutboundMessages). "Accepté" est
// volontairement distinct de "Envoyé" : Meta répond 200 à l'envoi même pour un message qu'il ne
// livrera jamais (fenêtre de 24h fermée, code 131047) — la nuance est le cœur de ce journal.
const JOURNAL_STATUT: Record<string, { label: string; className: string }> = {
  accepte: { label: "Accepté", className: "border-muted-foreground/30 text-muted-foreground" },
  envoye: { label: "Envoyé", className: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  delivre: { label: "Délivré", className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400" },
  lu: { label: "Lu", className: "border-green-600/40 bg-green-600/15 text-green-700 dark:text-green-400" },
  echec: { label: "Échec", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const MAINTENANCE_STATUT_LABEL: Record<string, { label: string; className: string }> = {
  en_cours: { label: "En cours", className: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  confirme: { label: "Confirmé", className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400" },
  planifie: { label: "Planifié", className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400" },
  escalade: { label: "Escaladé (argent)", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" },
  sans_reponse: { label: "Décliné", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

function isAudioAttachment(url: string): boolean {
  return /\.(mp3|ogg|opus|m4a|wav|aac)$/i.test(url);
}

export default async function AgentIaPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { onglet } = await searchParams;
  const ongletActif = onglet === "personnel" || onglet === "maintenance" ? onglet : "clients";

  const db = getDb();

  const conversations = await db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt));

  const staffRequests = await db
    .select({
      id: staffAssignmentRequests.id,
      role: staffAssignmentRequests.role,
      statut: staffAssignmentRequests.statut,
      candidatsEssayes: staffAssignmentRequests.candidatsEssayes,
      candidatsSollicitesIds: staffAssignmentRequests.candidatsSollicitesIds,
      personnelConfirmeId: staffAssignmentRequests.personnelConfirmeId,
      historique: staffAssignmentRequests.historique,
      updatedAt: staffAssignmentRequests.updatedAt,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(staffAssignmentRequests)
    .leftJoin(reservations, eq(reservations.id, staffAssignmentRequests.reservationId))
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .orderBy(desc(staffAssignmentRequests.updatedAt));

  const allPersonnel = await db.select({ id: personnel.id, nom: personnel.nom }).from(personnel);
  const nomParId = new Map(allPersonnel.map((p) => [p.id, p.nom]));

  const maintenanceRows = await db
    .select({
      id: maintenanceConversations.id,
      messages: maintenanceConversations.messages,
      statut: maintenanceConversations.statut,
      dateVenue: maintenanceConversations.dateVenue,
      updatedAt: maintenanceConversations.updatedAt,
      technicianNom: technicians.nom,
      technicianFonction: technicians.fonction,
      interventionTitre: interventions.titre,
      attachmentUrls: interventions.attachmentUrls,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(maintenanceConversations)
    .leftJoin(technicians, eq(technicians.id, maintenanceConversations.technicianId))
    .leftJoin(interventions, eq(interventions.id, maintenanceConversations.interventionId))
    .leftJoin(villas, eq(villas.id, interventions.villaId))
    .orderBy(desc(maintenanceConversations.updatedAt));

  // Journal WhatsApp brut : tout ce qui est réellement parti et arrivé, dans les deux sens, avec
  // le statut de livraison confirmé par Meta et les notes vocales réécoutables. Les autres onglets
  // montrent une conversation reconstituée par agent ; celui-ci montre le canal lui-même — seul
  // endroit où l'on voit qu'un message a été refusé (fenêtre 24h) plutôt que simplement "envoyé".
  const journalRows = await db
    .select()
    .from(whatsappOutboundMessages)
    .orderBy(desc(whatsappOutboundMessages.createdAt))
    .limit(500);

  // Un même numéro peut être journalisé avec ou sans "+" selon le chemin d'appel (l'API Meta
  // renvoie le numéro nu) — on normalise pour ne pas éclater une conversation en deux fils.
  const normaliserTel = (tel: string) => `+${tel.replace(/^\+/, "")}`;
  const nomParTelephone = new Map<string, string>();
  for (const p of await db.select({ nom: personnel.nom, telephone: personnel.telephone }).from(personnel)) {
    if (p.telephone) nomParTelephone.set(normaliserTel(p.telephone), p.nom);
  }
  for (const t of await db.select({ nom: technicians.nom, fonction: technicians.fonction, telephone: technicians.telephone }).from(technicians)) {
    if (t.telephone) nomParTelephone.set(normaliserTel(t.telephone), `${t.nom}${t.fonction ? ` (${t.fonction})` : ""}`);
  }

  const filsParTelephone = new Map<string, typeof journalRows>();
  for (const row of journalRows) {
    const tel = normaliserTel(row.destinataire);
    const fil = filsParTelephone.get(tel);
    if (fil) fil.push(row);
    else filsParTelephone.set(tel, [row]);
  }
  // Fils les plus récents en premier ; à l'intérieur d'un fil, ordre chronologique de lecture.
  const fils = [...filsParTelephone.entries()].map(([telephone, messages]) => ({
    telephone,
    nom: nomParTelephone.get(telephone) ?? null,
    messages: [...messages].reverse(),
    dernier: messages[0].createdAt,
  }));

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
          <TabsTrigger value="maintenance" className="shrink-0">
            Techniciens ({maintenanceRows.length})
          </TabsTrigger>
          <TabsTrigger value="journal" className="shrink-0">
            Journal WhatsApp ({fils.length})
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
              const sollicites = (r.candidatsSollicitesIds as string[]) ?? [];
              const historique = (r.historique as HistoriqueEntry[]) ?? [];
              return (
                <details key={r.id} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ROLE_LABEL[r.role] ?? r.role}</Badge>
                        <Badge variant="outline" className={statut.className}>
                          {statut.label}
                        </Badge>
                        <span className="text-sm font-medium">
                          {r.villaNom ?? "Villa"}
                          {r.villaNumero ? ` (n°${r.villaNumero})` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.guestName ?? "Réservation"} ·{" "}
                        {r.checkIn ? format(new Date(r.checkIn), "d MMM", { locale: fr }) : "?"} →{" "}
                        {r.checkOut ? format(new Date(r.checkOut), "d MMM yyyy", { locale: fr }) : "?"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.statut === "confirme" && r.personnelConfirmeId
                          ? `Confirmé : ${nomParId.get(r.personnelConfirmeId) ?? "?"}`
                          : r.statut === "en_recherche" && sollicites.length > 0
                            ? `En attente de réponse : ${sollicites.map((id) => nomParId.get(id) ?? "?").join(", ")}`
                            : `${essayees.length} candidate(s) sollicitée(s), aucune disponible`}
                        {essayees.length > sollicites.length
                          ? ` — ${essayees.length} au total depuis le début (${essayees.map((id) => nomParId.get(id) ?? "?").join(", ")})`
                          : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.updatedAt), "d MMM yyyy HH:mm", { locale: fr })}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t p-4">
                    {historique.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun message échangé pour l&apos;instant.</p>
                    ) : (
                      historique.map((h, i) =>
                        h.type === "relance" ? (
                          <div key={i} className="mx-auto max-w-full bg-transparent text-center font-mono text-xs text-muted-foreground">
                            ⏱ {h.texte}
                          </div>
                        ) : (
                          <div
                            key={i}
                            className={cn(
                              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                              h.type === "offre" && "ml-auto bg-primary/10",
                              h.type === "reponse" && "ml-0 bg-muted"
                            )}
                          >
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {h.type === "offre" ? `Agent IA → ${h.candidatNom}` : `${h.candidatNom} → Agent IA`}
                            </p>
                            <p className="whitespace-pre-wrap">{h.texte}</p>
                          </div>
                        )
                      )
                    )}
                  </div>
                </details>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-3 pt-2">
          {maintenanceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune conversation technicien pour l&apos;instant.</p>
          ) : (
            maintenanceRows.map((r) => {
              const segments = toSegments((r.messages as StoredMessage[]) ?? []);
              const statut = MAINTENANCE_STATUT_LABEL[r.statut] ?? { label: r.statut, className: "" };
              const audios = (r.attachmentUrls ?? []).filter(isAudioAttachment);
              return (
                <details key={r.id} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={statut.className}>
                          {statut.label}
                        </Badge>
                        <span className="text-sm font-medium">
                          {r.technicianNom ?? "Technicien"}
                          {r.technicianFonction ? ` (${r.technicianFonction})` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.interventionTitre ?? "Intervention"}
                        {r.villaNom ? ` — ${r.villaNom}${r.villaNumero ? ` (n°${r.villaNumero})` : ""}` : ""}
                        {r.dateVenue ? ` · Passage : ${r.dateVenue}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.updatedAt), "d MMM yyyy HH:mm", { locale: fr })}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t p-4">
                    {segments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun message échangé pour l&apos;instant.</p>
                    ) : (
                      segments.map((s, i) => (
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
                              {s.kind === "client" ? "Technicien" : "Agent IA"}
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap">{s.text}</p>
                        </div>
                      ))
                    )}
                    {audios.length > 0 ? (
                      <div className="space-y-1.5 pt-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Audio</p>
                        {audios.map((url, i) => (
                          <audio key={i} controls src={url} className="w-full" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="journal" className="space-y-2 pt-2">
          {fils.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun message WhatsApp journalisé pour l&apos;instant.</p>
          ) : (
            fils.map((fil) => (
              <details key={fil.telephone} className="group rounded-lg border" open={fils.length === 1}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <span className="text-sm font-medium">{fil.nom ?? fil.telephone}</span>
                    {fil.nom ? <span className="ml-2 text-xs text-muted-foreground">{fil.telephone}</span> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fil.messages.length} message{fil.messages.length > 1 ? "s" : ""} ·{" "}
                      {fil.messages.filter((m) => m.canal === "vocal").length} vocal
                      {fil.messages.filter((m) => m.canal === "vocal").length > 1 ? "aux" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(fil.dernier), "d MMM yyyy HH:mm", { locale: fr })}
                  </span>
                </summary>
                <div className="space-y-2 border-t p-4">
                  {fil.messages.map((m) => {
                    const statut = JOURNAL_STATUT[m.statut] ?? { label: m.statut, className: "" };
                    const entrant = m.sens === "entrant";
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                          entrant ? "ml-0 bg-muted" : "ml-auto bg-primary/10"
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {entrant ? `${fil.nom ?? "Contact"} → Agent IA` : `Agent IA → ${fil.nom ?? "Contact"}`}
                          </span>
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">
                            {m.canal === "vocal" ? "vocal" : m.canal === "template" ? "modèle" : "texte"}
                          </Badge>
                          {/* Le statut n'a de sens que sortant : un message reçu est par définition arrivé. */}
                          {entrant ? null : (
                            <Badge variant="outline" className={cn("px-1 py-0 text-[10px]", statut.className)}>
                              {statut.label}
                            </Badge>
                          )}
                          {m.contexte ? (
                            <span className="text-[10px] text-muted-foreground">{m.contexte}</span>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap" dir="auto">
                          {m.contenu}
                        </p>
                        {/* Réécoute de la note vocale telle qu'elle a été envoyée/reçue — le texte
                            affiché au-dessus est ce qui a été lu (sortant) ou transcrit (entrant). */}
                        {m.audioUrl ? (
                          <audio controls preload="none" src={m.audioUrl} className="mt-2 h-8 w-full max-w-xs" />
                        ) : null}
                        {m.erreur ? <p className="mt-1 text-[11px] text-destructive">{m.erreur}</p> : null}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {format(new Date(m.createdAt), "d MMM HH:mm", { locale: fr })}
                          {m.renvoyeAt
                            ? ` · vocal renvoyé ${format(new Date(m.renvoyeAt), "d MMM HH:mm", { locale: fr })}`
                            : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))
          )}
        </TabsContent>
      </PersonnelTabs>
    </div>
  );
}
