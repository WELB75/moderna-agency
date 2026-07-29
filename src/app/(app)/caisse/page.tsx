import Image from "next/image";
import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { cashEntries, villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddCashEntryDialog } from "@/components/app/add-cash-entry-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { CaisseStats } from "@/components/app/caisse-stats";
import { deleteCashEntry } from "@/lib/actions/caisse";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  remise: "Argent confié",
  loyer: "Loyer reçu",
  extra: "Extra (petit-déj, options)",
  depense: "Dépense",
  restitution: "Restitution",
};

type Entry = {
  id: string;
  type: string;
  montant: string;
  devise: string;
  description: string | null;
  responsable: string | null;
  createdByName: string | null;
  createdAt: Date;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  photoUrls: string[] | null;
};

export default async function CaissePage() {
  const db = getDb();

  const entries = (
    await db
      .select({
        id: cashEntries.id,
        type: cashEntries.type,
        moyenPaiement: cashEntries.moyenPaiement,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        description: cashEntries.description,
        responsable: cashEntries.responsable,
        photoUrls: cashEntries.photoUrls,
        createdByName: cashEntries.createdByName,
        createdAt: cashEntries.createdAt,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(desc(cashEntries.createdAt))
  ).filter((e) => domaineEstActif(e.domaineNom));

  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((v) => domaineEstActif(v.domaineNom));

  const especes = entries.filter((e) => e.moyenPaiement === "especes");
  const virement = entries.filter((e) => e.moyenPaiement === "virement");
  const carte = entries.filter((e) => e.moyenPaiement === "carte");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>
        <p className="text-sm text-muted-foreground">Argent confié, dépenses et restitutions</p>
      </div>

      <Tabs defaultValue="especes">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="especes">Espèces</TabsTrigger>
          <TabsTrigger value="virement">Virement bancaire</TabsTrigger>
          <TabsTrigger value="carte">Carte bleue</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>
        <TabsContent value="especes" className="pt-2">
          <CaissePanel entries={especes} villas={allVillas} moyenPaiement="especes" />
        </TabsContent>
        <TabsContent value="virement" className="pt-2">
          <CaissePanel entries={virement} villas={allVillas} moyenPaiement="virement" />
        </TabsContent>
        <TabsContent value="carte" className="pt-2">
          <CaissePanel entries={carte} villas={allVillas} moyenPaiement="carte" />
        </TabsContent>
        <TabsContent value="stats" className="pt-2">
          <CaisseStats entries={entries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CaissePanel({
  entries,
  villas,
  moyenPaiement,
}: {
  entries: Entry[];
  villas: { id: string; nom: string; numero: string }[];
  moyenPaiement: "especes" | "virement" | "carte";
}) {
  // Des montants dans des devises différentes ne doivent jamais être additionnés ensemble
  // (ex. 13000 MAD + 6400 EUR n'a aucun sens) : un jeu de totaux par devise présente.
  const devises = Array.from(new Set(entries.map((e) => e.devise))).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <AddCashEntryDialog villas={villas} moyenPaiement={moyenPaiement} />
      </div>

      {devises.map((devise) => {
        const enDevise = entries.filter((e) => e.devise === devise);
        // Deux étages bien séparés : les loyers reçus des clients (aucun rapport avec les
        // dépenses) d'un côté, et l'argent confié par la société + ce qui en a été dépensé
        // de l'autre. Les extras (petit-déj, options...) sont des recettes clients aussi,
        // mais distinctes du loyer pur — donc jamais additionnées dans "Total loyers reçus".
        const totalLoyer = enDevise.filter((e) => e.type === "loyer").reduce((s, e) => s + Number(e.montant), 0);
        const totalExtra = enDevise.filter((e) => e.type === "extra").reduce((s, e) => s + Number(e.montant), 0);
        const totalRemise = enDevise.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
        const totalDepense = enDevise.filter((e) => e.type === "depense").reduce((s, e) => s + Number(e.montant), 0);
        const totalRestitution = enDevise
          .filter((e) => e.type === "restitution")
          .reduce((s, e) => s + Number(e.montant), 0);
        const soldeSociete = totalRemise - totalDepense - totalRestitution;

        return (
          <div key={devise} className="space-y-4">
            {devises.length > 1 ? <p className="text-sm font-medium text-muted-foreground">{devise}</p> : null}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Loyers perçus (clients)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Total loyers reçus" value={totalLoyer} devise={devise} highlight />
                <SummaryCard label="Extras (petit-déj, options...)" value={totalExtra} devise={devise} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Société (confié / dépenses)
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Solde société" value={soldeSociete} devise={devise} highlight />
                <SummaryCard label="Total confié (société)" value={totalRemise} devise={devise} />
                <SummaryCard label="Total dépensé" value={totalDepense} devise={devise} />
                <SummaryCard label="Total restitué" value={totalRestitution} devise={devise} />
              </div>
            </div>
          </div>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mouvements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={e.type === "remise" || e.type === "loyer" || e.type === "extra" ? "secondary" : "outline"}
                      className={cn(
                        e.type === "loyer" && "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
                        e.type === "extra" && "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                      )}
                    >
                      {TYPE_LABELS[e.type]}
                    </Badge>
                    <span className="font-semibold">
                      {e.type === "remise" || e.type === "loyer" || e.type === "extra" ? "+" : "-"}
                      {Number(e.montant).toFixed(2)} {e.devise}
                    </span>
                  </div>
                  {e.description ? <p className="mt-1 text-sm">{e.description}</p> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {e.domaineNom ? <DomaineBadge nom={e.domaineNom} className="text-xs" /> : null}
                    {e.villaNom ? (
                      <span className="text-xs text-muted-foreground">
                        {e.villaNom} (n°{e.villaNumero})
                      </span>
                    ) : null}
                    {e.responsable ? (
                      <span className="text-xs text-muted-foreground">· {e.responsable}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajouté par {e.createdByName ?? "Équipe"} ·{" "}
                    {format(new Date(e.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                  </p>
                  {e.photoUrls && e.photoUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {e.photoUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="relative h-16 w-16 overflow-hidden rounded-md border">
                          <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <ConfirmDeleteButton
                  action={deleteCashEntry.bind(null, e.id)}
                  title="Supprimer ce mouvement ?"
                  description="Cette action est irréversible."
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  devise,
  highlight,
}: {
  label: string;
  value: number;
  devise: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={highlight ? "text-2xl font-semibold text-primary" : "text-2xl font-semibold"}>
          {value.toFixed(2)} {devise}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
