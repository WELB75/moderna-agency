import { asc, desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMemoireFiches } from "@/db/schema-memoire-agent";
import { assurerTablesMemoire, connaissancesAgent, statsMemoire } from "@/lib/messages-agent/memoire";
import { CodesTrouves, type PropositionCode } from "./codes-trouves";
import { ConnaissancesAgent } from "./connaissances-agent";
import { MemoireAgentClient, type FicheAffichee } from "./memoire-agent-client";

// L'apprentissage (lecture des fils, analyse, consolidation) tourne dans des actions appelées
// depuis cette page : on leur laisse le temps de finir un lot.
export const maxDuration = 300;

export default async function MemoireAgentPage() {
  await assurerTablesMemoire();
  const [rows, stats, connaissances] = await Promise.all([
    getDb().select().from(agentMemoireFiches).orderBy(asc(agentMemoireFiches.theme), desc(agentMemoireFiches.nbSources)),
    statsMemoire(),
    connaissancesAgent(),
  ]);
  const propositionsCodes = (
    await getDb().execute(sql`
      SELECT c.id, c.villa_nom, c.type, c.valeur, v.code_wifi, v.code_boitier, v.code_porte_entree
      FROM agent_memoire_codes c LEFT JOIN villas v ON lower(v.nom) = lower(c.villa_nom)
      WHERE c.statut = 'propose' ORDER BY c.villa_nom, c.type`)
  ).rows as { id: string; villa_nom: string; type: "wifi" | "boitier" | "porte"; valeur: string; code_wifi: string | null; code_boitier: string | null; code_porte_entree: string | null }[];
  const codes: PropositionCode[] = propositionsCodes.map((p) => ({
    id: p.id,
    villaNom: p.villa_nom,
    type: p.type,
    valeur: p.valeur,
    actuel: p.type === "wifi" ? p.code_wifi : p.type === "boitier" ? p.code_boitier : p.code_porte_entree,
  }));
  const fiches: FicheAffichee[] = rows.map((f) => ({
    id: f.id,
    theme: f.theme,
    titre: f.titre,
    question: f.question,
    reponse: f.reponse,
    villaNom: f.villaNom,
    actif: f.actif,
    epingle: f.epingle,
    nbSources: f.nbSources,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mémoire de l&apos;agent</h1>
        <p className="text-sm text-muted-foreground">
          Ce que l&apos;agent IA a appris des conversations Airbnb, Booking.com et WhatsApp (ligne de l&apos;agence) : ce que les
          voyageurs demandent et ce que l&apos;équipe répond. Quand tu génères une réponse dans Messages, l&apos;agent s&apos;appuie sur ces fiches (celles de
          tous les logements, plus celles du logement concerné). Les noms, téléphones, emails, liens et codes sont retirés avant
          stockage.
        </p>
      </div>
      <MemoireAgentClient fiches={fiches} stats={{ ...stats, derniere: stats.derniere ? stats.derniere.toISOString() : null }} />
      <CodesTrouves propositions={codes} />
      <ConnaissancesAgent connaissances={connaissances} stats={{ filsAnalyses: stats.filsAnalyses, fichesActives: stats.fichesActives, echanges: stats.echanges }} />
    </div>
  );
}
