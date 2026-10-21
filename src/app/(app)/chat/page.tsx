import { MessagesBoiteReception } from "./messages-boite-reception";

// Les onglets Interne (chat d'équipe) et Agent IA (transcripts des agents automatiques) sont
// retirés de la page pour le moment — Kamel, 2026-10-10 : "pas d'onglet interne, ni agent ia, on
// arrête pour le moment". Leurs composants (messages-interne.tsx, messages-agent-ia.tsx) restent
// dans le dossier, juste non affichés : les rebrancher ici (via PersonnelTabs, ?section=) les
// remettrait tels quels.
//
// Pas de titre au-dessus de la boîte (2026-10-22) : elle occupe toute la hauteur utile, et son
// propre en-tête dit déjà "Messages" + ce qu'il reste à répondre.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const { conv } = await searchParams;
  return <MessagesBoiteReception selectedKeyParam={conv} />;
}
