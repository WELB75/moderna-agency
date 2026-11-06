import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { BedDouble, ExternalLink, IdCard, LogIn, ShieldAlert, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { SecuriteLogements, SecuriteWhatsAppButton } from "@/components/app/securite-logements";
import { AgentsSecuriteEditor, EnvoisSecurite, type DossierSecurite } from "@/components/app/securite-envois";
import { getSecuriteOverview, type SecuriteLogementResume } from "@/lib/security-data";
import { chargerArriveesDocuments, ficheToutRecue, progressionFiche } from "@/lib/arrivees-documents";
import { getAgentsSecurite, getEnvoisSecurite, type EnvoiSecurite } from "@/lib/securite-agents";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { ficheACompleter } from "@/lib/securite-fiche";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";

// Sécurité — nouvelle version : tous les logements intégrés (Beds24) des domaines suivis, plus
// seulement les villas de Moderna II. Villa Kamel et les autres logements retirés n'y figurent
// plus (voir logementEstIntegre). Un onglet et un lien par domaine : chaque domaine a ses propres
// agents de sécurité, on ne mélange jamais deux domaines sur un même lien.
export default async function SecuritePage() {
  const now = nowInMorocco();
  const [domaines, arriveesDocs] = await Promise.all([getSecuriteOverview(), chargerArriveesDocuments(now, 4)]);
  const agentsParDomaine = await getAgentsSecurite(domaines.map((d) => d.id));
  const envois = await getEnvoisSecurite([...agentsParDomaine.values()].flat());
  const dossiersParDomaine = await construireDossiers(domaines, arriveesDocs, envois);
  const tous = domaines.flatMap((d) => d.logements);

  const sejourDuJour = (l: SecuriteLogementResume) =>
    l.statut === "arrivee" || l.statut === "occupe" || l.statut === "depart";
  const arrivees = tous.filter((l) => l.statut === "arrivee").length;
  const occupes = tous.filter(sejourDuJour).length;
  const aCompleter = tous.filter((l) => ficheACompleter(l.sejour)).length;
  const personnesEnregistrees = tous
    .filter(sejourDuJour)
    .reduce((s, l) => s + (l.sejour?.personnesEnregistrees ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sécurité</h1>
        <p className="text-sm text-muted-foreground">
          {format(now, "EEEE d MMMM yyyy", { locale: fr })} — qui arrive, qui est sur place et où en sont les fiches
          police. Un lien par domaine à envoyer à son agent de sécurité : ne jamais mélanger les domaines.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={LogIn} label="Arrivées aujourd'hui" value={String(arrivees)} tone="emerald" />
        <Stat icon={BedDouble} label="Logements occupés" value={`${occupes}/${tous.length}`} tone="primary" />
        <Stat icon={ShieldAlert} label="Fiches police à compléter" value={String(aCompleter)} tone={aCompleter > 0 ? "red" : "muted"} />
        <Stat icon={IdCard} label="Personnes enregistrées" value={String(personnesEnregistrees)} tone="muted" />
      </div>

      {domaines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun domaine pour l&apos;instant.</p>
      ) : (
        <Tabs defaultValue={domaines[0].id}>
          <TabsList className="h-11 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-muted p-1">
            {domaines.map((d) => {
              const alertes = d.logements.filter((l) => ficheACompleter(l.sejour)).length;
              return (
                <TabsTrigger
                  key={d.id}
                  value={d.id}
                  className="h-9 shrink-0 gap-2 rounded-md px-4 text-sm font-semibold data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
                >
                  {d.nom}
                  <span className="rounded-full bg-background/20 px-1.5 text-xs tabular-nums">{d.logements.length}</span>
                  {alertes > 0 ? (
                    <span className="h-2 w-2 rounded-full bg-red-500" aria-label={`${alertes} fiche(s) à compléter`} />
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {domaines.map((d) => {
            const nbVillas = d.logements.filter((l) => l.type === "villa").length;
            const nbApparts = d.logements.length - nbVillas;
            return (
              <TabsContent key={d.id} value={d.id} className="space-y-4 pt-2">
                <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Liens pour la sécurité de {d.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          nbVillas ? `${nbVillas} villa${nbVillas > 1 ? "s" : ""}` : null,
                          nbApparts ? `${nbApparts} appartement${nbApparts > 1 ? "s" : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Aucun logement"}{" "}
                        — liens toujours à jour, sans connexion.
                      </p>
                    </div>
                    <Link
                      href={`/securite/domaine/${d.id}`}
                      target="_blank"
                      className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline md:min-h-0"
                    >
                      Voir comme la sécurité
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyLinkButton
                      path={`/securite/domaine/${d.id}`}
                      label="Copier le lien général"
                      successMessage={`Lien copié — envoie-le une fois à la sécurité de ${d.nom}.`}
                    />
                    <CopyLinkButton
                      path={`/securite/domaine/${d.id}?jour=1`}
                      label="Copier le lien du jour"
                      successMessage={`Lien copié — n'affiche que les arrivées du jour pour ${d.nom}.`}
                    />
                    {d.securitePhone ? (
                      <SecuriteWhatsAppButton securitePhone={d.securitePhone} domaineId={d.id} domaineNom={d.nom} />
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
                  <div>
                    <p className="text-sm font-semibold">Envois à la sécurité</p>
                    <p className="text-xs text-muted-foreground">
                      Le message part tout seul quand la fiche police et le contrat sont validés. Sinon, envoie-le à la
                      main : il part à tous les agents du domaine, et leur statut se met à jour ici (envoyé, délivré, lu).
                    </p>
                  </div>
                  <AgentsSecuriteEditor domaineId={d.id} domaineNom={d.nom} agents={agentsParDomaine.get(d.id) ?? []} />
                  <EnvoisSecurite dossiers={dossiersParDomaine.get(d.id) ?? []} agents={agentsParDomaine.get(d.id) ?? []} />
                </div>

                {d.logements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun logement pour ce domaine.</p>
                ) : (
                  <SecuriteLogements logements={d.logements} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

// Arrivées des 4 prochains jours du domaine (avec l'état des passeports) + séjours déjà signalés
// à la sécurité ces 30 derniers jours, chacun avec ses envois WhatsApp par agent.
async function construireDossiers(
  domaines: { id: string; nom: string; logements: { villaId: string }[] }[],
  arrivees: Awaited<ReturnType<typeof chargerArriveesDocuments>>,
  envois: EnvoiSecurite[]
): Promise<Map<string, DossierSecurite[]>> {
  const domaineParVilla = new Map<string, string>();
  for (const d of domaines) for (const l of d.logements) domaineParVilla.set(l.villaId, d.id);
  const envoisParResa = new Map<string, EnvoiSecurite[]>();
  for (const e of envois) {
    if (!e.reservationId) continue;
    envoisParResa.set(e.reservationId, [...(envoisParResa.get(e.reservationId) ?? []), e]);
  }
  const libelle = (d: Date) => format(d, "EEE d MMM 'à' HH:mm", { locale: fr });

  const parDomaine = new Map<string, DossierSecurite[]>(domaines.map((d) => [d.id, []]));
  const vus = new Set<string>();
  for (const a of arrivees) {
    const domaineId = a.villaId ? domaineParVilla.get(a.villaId) : undefined;
    if (!domaineId) continue;
    vus.add(a.id);
    parDomaine.get(domaineId)?.push({
      reservationId: a.id,
      guestName: a.guestName,
      villaNom: a.villaNom ?? "",
      arrivee: libelle(a.checkIn),
      aVenir: true,
      passeports: progressionFiche(a.fiche),
      ficheComplete: Boolean(a.fiche && ficheToutRecue(a.fiche)),
      envois: envoisParResa.get(a.id) ?? [],
    });
  }

  const autres = [...envoisParResa.keys()].filter((id) => !vus.has(id));
  if (autres.length > 0) {
    const resas = await getDb()
      .select({ id: reservations.id, guestName: reservations.guestName, checkIn: reservations.checkIn, villaId: reservations.villaId, villaNom: villas.nom })
      .from(reservations)
      .leftJoin(villas, eq(villas.id, reservations.villaId))
      .where(inArray(reservations.id, autres));
    resas.sort((x, y) => y.checkIn.getTime() - x.checkIn.getTime());
    for (const r of resas) {
      const domaineId = r.villaId ? domaineParVilla.get(r.villaId) : undefined;
      if (!domaineId) continue;
      parDomaine.get(domaineId)?.push({
        reservationId: r.id,
        guestName: r.guestName,
        villaNom: r.villaNom ?? "",
        arrivee: libelle(r.checkIn),
        aVenir: false,
        passeports: null,
        ficheComplete: false,
        envois: envoisParResa.get(r.id) ?? [],
      });
    }
  }
  return parDomaine;
}

const TONES = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  primary: "bg-primary/10 text-primary",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  muted: "bg-muted text-muted-foreground",
} as const;

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 sm:p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        <p className="text-xs leading-tight text-muted-foreground sm:text-sm md:truncate">{label}</p>
      </div>
    </div>
  );
}
