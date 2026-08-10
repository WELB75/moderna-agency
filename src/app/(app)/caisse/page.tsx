import { desc, eq, ne, gte, and } from "drizzle-orm";
import { subDays } from "date-fns";
import { getDb } from "@/db";
import { cashEntries, villas, domaines, reservations } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddCashEntryDialog } from "@/components/app/add-cash-entry-dialog";
import { CaisseMouvementsList } from "@/components/app/caisse-mouvements-list";
import { CaisseStats } from "@/components/app/caisse-stats";
import { domaineEstActif } from "@/lib/domaines-actifs";
import type { Entry } from "@/lib/caisse-labels";

export default async function CaissePage() {
  const db = getDb();

  const entries = (
    await db
      .select({
        id: cashEntries.id,
        type: cashEntries.type,
        categorie: cashEntries.categorie,
        financePar: cashEntries.financePar,
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
        guestName: reservations.guestName,
      })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .leftJoin(reservations, eq(cashEntries.reservationId, reservations.id))
      .orderBy(desc(cashEntries.createdAt))
  ).filter((e) => domaineEstActif(e.domaineNom));

  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((v) => domaineEstActif(v.domaineNom));

  // Pour le sélecteur "Client" du formulaire manuel : les séjours récents/en cours suffisent,
  // pas besoin de remonter tout l'historique.
  const recentReservations = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        villaId: reservations.villaId,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
        checkIn: reservations.checkIn,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, subDays(new Date(), 30))))
      .orderBy(desc(reservations.checkIn))
  ).filter((r) => domaineEstActif(r.domaineNom));

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
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="especes" className="shrink-0">Espèces</TabsTrigger>
          <TabsTrigger value="virement" className="shrink-0">Virement bancaire</TabsTrigger>
          <TabsTrigger value="carte" className="shrink-0">Carte bleue</TabsTrigger>
          <TabsTrigger value="stats" className="shrink-0">Statistiques</TabsTrigger>
        </TabsList>
        <TabsContent value="especes" className="pt-2">
          <CaissePanel entries={especes} villas={allVillas} reservations={recentReservations} moyenPaiement="especes" />
        </TabsContent>
        <TabsContent value="virement" className="pt-2">
          <CaissePanel entries={virement} villas={allVillas} reservations={recentReservations} moyenPaiement="virement" />
        </TabsContent>
        <TabsContent value="carte" className="pt-2">
          <CaissePanel entries={carte} villas={allVillas} reservations={recentReservations} moyenPaiement="carte" />
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
  reservations,
  moyenPaiement,
}: {
  entries: Entry[];
  villas: { id: string; nom: string; numero: string }[];
  reservations: { id: string; guestName: string; villaId: string | null; villaNom: string | null; villaNumero: string | null }[];
  moyenPaiement: "especes" | "virement" | "carte";
}) {
  // Des montants dans des devises différentes ne doivent jamais être additionnés ensemble
  // (ex. 13000 MAD + 6400 EUR n'a aucun sens) : un jeu de totaux par devise présente.
  const devises = Array.from(new Set(entries.map((e) => e.devise))).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <AddCashEntryDialog villas={villas} reservations={reservations} moyenPaiement={moyenPaiement} />
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
        // Seules les dépenses financées par l'avance société comptent contre le solde société —
        // une dépense payée avec les loyers personnels de Kamel n'est pas une dette de la société
        // envers lui (voir cashFinanceParEnum dans db/schema.ts), donc exclue de ce calcul.
        const totalDepenseSociete = enDevise
          .filter((e) => e.type === "depense" && e.financePar === "societe")
          .reduce((s, e) => s + Number(e.montant), 0);
        const totalDepenseLoyers = enDevise
          .filter((e) => e.type === "depense" && e.financePar === "loyers_perso")
          .reduce((s, e) => s + Number(e.montant), 0);
        const totalRestitution = enDevise
          .filter((e) => e.type === "restitution")
          .reduce((s, e) => s + Number(e.montant), 0);
        const soldeSociete = totalRemise - totalDepenseSociete - totalRestitution;

        return (
          <div key={devise} className="space-y-4">
            {devises.length > 1 ? <p className="text-sm font-medium text-muted-foreground">{devise}</p> : null}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Loyers perçus (clients)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Total loyers reçus" value={totalLoyer} devise={devise} highlight />
                <SummaryCard label="Extras (petit-déj, options...)" value={totalExtra} devise={devise} />
                <SummaryCard label="Dépenses payées avec mes loyers" value={totalDepenseLoyers} devise={devise} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Société (confié / dépenses)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Solde société" value={soldeSociete} devise={devise} highlight />
                <SummaryCard label="Total confié (société)" value={totalRemise} devise={devise} />
                <SummaryCard label="Total restitué" value={totalRestitution} devise={devise} />
              </div>
            </div>
          </div>
        );
      })}

      <CaisseMouvementsList entries={entries} />
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
