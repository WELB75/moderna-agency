import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonnelTabs } from "@/components/app/personnel-tabs";
import { MessagesInterne } from "./messages-interne";
import { MessagesBoiteReception } from "./messages-boite-reception";
import { MessagesAgentIa } from "./messages-agent-ia";

// Fusion de trois anciens onglets distincts (Messages, Boîte de réception, Agent IA) en un
// seul, avec un niveau d'onglets supplémentaire (?section=) — Kamel, 2026-09-29 : "Boite de
// reception et message fusionne le avec agent ia etc en faite on allege les onglets là, faut
// trouver un titre ou y a tout dedans". Les trois contenus étaient déjà des sections
// indépendantes (chat interne par catégorie, fils WhatsApp/OTA externes, transcripts des agents
// automatiques) — juste dispersés sur trois entrées de menu qui se ressemblaient assez pour
// prêter à confusion. Chaque section garde ses propres requêtes et son propre sous-onglet
// (?onglet=), inchangé par rapport à avant la fusion.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; onglet?: string; conv?: string }>;
}) {
  const { section, onglet, conv } = await searchParams;
  const sectionActive = section === "boite" || section === "agent" ? section : "interne";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Chat interne de l&apos;équipe, boîte de réception WhatsApp/Airbnb/Booking.com, et ce que disent les agents automatiques en ton nom.
        </p>
      </div>

      <PersonnelTabs defaultTab={sectionActive} paramName="section">
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="interne" className="shrink-0">
            Interne
          </TabsTrigger>
          <TabsTrigger value="boite" className="shrink-0">
            Boîte de réception
          </TabsTrigger>
          <TabsTrigger value="agent" className="shrink-0">
            Agent IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interne" className="pt-2">
          <MessagesInterne ongletParam={onglet} />
        </TabsContent>
        <TabsContent value="boite" className="pt-2">
          <MessagesBoiteReception selectedKeyParam={conv} />
        </TabsContent>
        <TabsContent value="agent" className="pt-2">
          <MessagesAgentIa ongletParam={onglet} />
        </TabsContent>
      </PersonnelTabs>
    </div>
  );
}
