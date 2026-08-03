import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chatMessages, villas, domaines } from "@/db/schema";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonnelTabs } from "@/components/app/personnel-tabs";
import { Badge } from "@/components/ui/badge";
import { ChatPanel, type ChatMessageRow } from "@/components/app/chat-panel";
import { filtrerDomainesActifs, idsVillasActives } from "@/lib/domaines-actifs";
import type { ChatCategorie } from "@/lib/actions/chat";

const CATEGORIES: { value: ChatCategorie; label: string }[] = [
  { value: "menage_cuisine", label: "Ménage & Cuisine" },
  { value: "reservations", label: "Réservations" },
  { value: "maintenance", label: "Maintenance" },
  { value: "caisse", label: "Caisse" },
  { value: "securite_documents", label: "Sécurité & Documents" },
  { value: "urgent", label: "Urgent" },
  { value: "general", label: "Général" },
];

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { onglet } = await searchParams;
  const ongletActif = CATEGORIES.some((c) => c.value === onglet) ? (onglet as ChatCategorie) : "menage_cuisine";

  const db = getDb();

  const allDomaines = await db.select().from(domaines);
  const domainesActifs = filtrerDomainesActifs(allDomaines);
  const domaineIdsActifs = new Set(domainesActifs.map((d) => d.id));
  const allVillasRaw = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineId: villas.domaineId }).from(villas);
  const villaIdsActives = idsVillasActives(allVillasRaw, domaineIdsActifs);
  const allVillas = allVillasRaw.filter((v) => villaIdsActives.has(v.id));

  const rows = await db
    .select({
      id: chatMessages.id,
      parentId: chatMessages.parentId,
      categorie: chatMessages.categorie,
      message: chatMessages.message,
      traite: chatMessages.traite,
      traiteAt: chatMessages.traiteAt,
      traitePar: chatMessages.traitePar,
      createdByName: chatMessages.createdByName,
      createdAt: chatMessages.createdAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: chatMessages.villaId,
    })
    .from(chatMessages)
    .leftJoin(villas, eq(chatMessages.villaId, villas.id))
    .orderBy(desc(chatMessages.createdAt));

  const parCategorie = new Map<ChatCategorie, ChatMessageRow[]>();
  const nonTraiteParCategorie = new Map<ChatCategorie, number>();
  for (const r of rows) {
    const list = parCategorie.get(r.categorie) ?? [];
    list.push(r);
    parCategorie.set(r.categorie, list);
    if (!r.traite) {
      nonTraiteParCategorie.set(r.categorie, (nonTraiteParCategorie.get(r.categorie) ?? 0) + 1);
    }
  }

  const totalNonTraite = rows.filter((r) => !r.traite).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Chat interne par catégorie, avec suivi — remplace les messages vocaux WhatsApp.
          {totalNonTraite > 0 ? ` ${totalNonTraite} message(s) pas encore traité(s).` : ""}
        </p>
      </div>

      <PersonnelTabs defaultTab={ongletActif}>
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          {CATEGORIES.map((c) => {
            const count = nonTraiteParCategorie.get(c.value) ?? 0;
            return (
              <TabsTrigger key={c.value} value={c.value} className="shrink-0">
                {c.label}
                {count > 0 ? <Badge className="ml-1">{count}</Badge> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIES.map((c) => (
          <TabsContent key={c.value} value={c.value} className="pt-2">
            <ChatPanel categorie={c.value} messages={parCategorie.get(c.value) ?? []} villas={allVillas} />
          </TabsContent>
        ))}
      </PersonnelTabs>
    </div>
  );
}
