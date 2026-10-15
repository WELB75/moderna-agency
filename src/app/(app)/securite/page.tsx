import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { BedDouble, ExternalLink, IdCard, LogIn, ShieldAlert, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { SecuriteLogements, SecuriteWhatsAppButton } from "@/components/app/securite-logements";
import { getSecuriteOverview, type SecuriteLogementResume } from "@/lib/security-data";
import { ficheACompleter } from "@/lib/securite-fiche";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";

// Sécurité — nouvelle version : tous les logements intégrés (Beds24) des domaines suivis, plus
// seulement les villas de Moderna II. Villa Kamel et les autres logements retirés n'y figurent
// plus (voir logementEstIntegre). Un onglet et un lien par domaine : chaque domaine a ses propres
// agents de sécurité, on ne mélange jamais deux domaines sur un même lien.
export default async function SecuritePage() {
  const domaines = await getSecuriteOverview();
  const now = nowInMorocco();
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
        <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
      </div>
    </div>
  );
}
