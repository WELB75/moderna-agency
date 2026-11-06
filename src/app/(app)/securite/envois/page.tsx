import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, CheckCheck, Send, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentsSecuriteEditor, CarteArrivee, dernierEnvoiParAgent } from "@/components/app/securite-envois";
import { getSuiviSecurite } from "@/lib/securite-agents";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Suivi sécurité : qui a été prévenu, où en est chaque message, et la conversation avec chaque
// agent (Kamel, 2026-11-06). Une carte par arrivée, lisible au téléphone d'un coup d'œil.
export default async function SuiviSecuritePage() {
  const now = nowInMorocco();
  const domaines = await getSuiviSecurite(now);

  const aVenir = domaines.flatMap((d) => d.dossiers.filter((x) => x.aVenir).map((x) => ({ d, x })));
  const aEnvoyer = aVenir.filter(({ x }) => x.envois.length === 0).length;
  const lus = aVenir.filter(({ d, x }) => {
    const l = dernierEnvoiParAgent(x, d.agents);
    return l.length > 0 && l.every((e) => e.envoi?.statut === "lu");
  }).length;
  const echecs = aVenir.filter(({ d, x }) => dernierEnvoiParAgent(x, d.agents).some((e) => e.envoi?.statut === "echec")).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <Link href="/securite" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Sécurité
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Suivi sécurité</h1>
        <p className="text-sm text-muted-foreground">
          {format(now, "EEEE d MMMM", { locale: fr })} — arrivées des 4 prochains jours. Touche une carte pour voir le message envoyé, le lien et
          les réponses de l&apos;agent.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={Send} label="À envoyer" value={aEnvoyer} tone={aEnvoyer > 0 ? "amber" : "muted"} />
        <Stat icon={CheckCheck} label="Lus par la sécurité" value={lus} tone={lus > 0 ? "sky" : "muted"} />
        <Stat icon={XCircle} label="Échecs" value={echecs} tone={echecs > 0 ? "red" : "muted"} />
      </div>

      {domaines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun domaine pour l&apos;instant.</p>
      ) : (
        <Tabs defaultValue={domaines[0].id}>
          <TabsList className="h-11 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-muted p-1">
            {domaines.map((d) => {
              const alertes = d.dossiers.filter((x) => x.aVenir && x.envois.length === 0).length;
              return (
                <TabsTrigger
                  key={d.id}
                  value={d.id}
                  className="h-9 shrink-0 gap-2 rounded-md px-4 text-sm font-semibold data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
                >
                  {d.nom}
                  {alertes > 0 ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-label={`${alertes} envoi(s) à faire`} /> : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {domaines.map((d) => {
            const prochains = d.dossiers.filter((x) => x.aVenir);
            const passes = d.dossiers.filter((x) => !x.aVenir);
            return (
              <TabsContent key={d.id} value={d.id} className="space-y-4 pt-2">
                <div className="rounded-2xl border bg-card p-3 sm:p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents de {d.nom}</p>
                  <AgentsSecuriteEditor domaineId={d.id} domaineNom={d.nom} agents={d.agents} />
                </div>

                {d.agents.length === 0 ? (
                  <p className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="h-4 w-4 shrink-0" /> Sans agent, aucun message ne peut partir pour ce domaine.
                  </p>
                ) : null}

                {prochains.length === 0 ? (
                  <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune arrivée dans les 4 prochains jours.</p>
                ) : (
                  <div className="space-y-2.5">
                    {prochains.map((x) => (
                      <CarteArrivee key={x.reservationId} dossier={x} agents={d.agents} />
                    ))}
                  </div>
                )}

                {passes.length > 0 ? (
                  <details className="group">
                    <summary className="cursor-pointer py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                      Envois des 30 derniers jours ({passes.length})
                    </summary>
                    <div className="mt-2 space-y-2.5">
                      {passes.map((x) => (
                        <CarteArrivee key={x.reservationId} dossier={x} agents={d.agents} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

const TONES = {
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  muted: "bg-muted text-muted-foreground",
} as const;

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border bg-card p-3">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</p>
      </div>
    </div>
  );
}
