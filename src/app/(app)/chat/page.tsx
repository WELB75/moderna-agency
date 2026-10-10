import { MessagesBoiteReception } from "./messages-boite-reception";

// Les onglets Interne (chat d'équipe) et Agent IA (transcripts des agents automatiques) sont
// retirés de la page pour le moment — Kamel, 2026-10-10 : "pas d'onglet interne, ni agent ia, on
// arrête pour le moment". Leurs composants (messages-interne.tsx, messages-agent-ia.tsx) restent
// dans le dossier, juste non affichés : les rebrancher ici (via PersonnelTabs, ?section=) les
// remettrait tels quels.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const { conv } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Boîte de réception WhatsApp et Booking.com.</p>
      </div>

      <MessagesBoiteReception selectedKeyParam={conv} />
    </div>
  );
}
