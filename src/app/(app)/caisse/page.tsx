import { desc, eq, ne, gte, lt, and } from "drizzle-orm";
import { subDays, subMonths, addMonths, format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { getDb } from "@/db";
import { cashEntries, caisseReconciliations, villas, domaines, reservations } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddCashEntryDialog } from "@/components/app/add-cash-entry-dialog";
import { BrahimCashActions } from "@/components/app/brahim-cash-actions";
import { CaisseMouvementsList } from "@/components/app/caisse-mouvements-list";
import { CaisseStats } from "@/components/app/caisse-stats";
import { CaisseReconciliationButton } from "@/components/app/caisse-reconciliation-button";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { moisHref, periodeAncre, periodeBounds } from "@/lib/caisse-periode";
import type { Entry } from "@/lib/caisse-labels";

export default async function CaissePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const db = getDb();

  const { mois } = await searchParams;
  const moisAncre = periodeAncre(mois);
  const { debut: debutMois, finExclusive: finMoisExclusive, finAffichee } = periodeBounds(moisAncre);

  const entries = (
    await db
      .select({
        id: cashEntries.id,
        type: cashEntries.type,
        categorie: cashEntries.categorie,
        caisse: cashEntries.caisse,
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
      .where(and(gte(cashEntries.createdAt, debutMois), lt(cashEntries.createdAt, finMoisExclusive)))
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

  // La caisse Brahim est un onglet à part entière (avance perso, pas mêlée à la caisse
  // société) — elle ne doit apparaître nulle part ailleurs, y compris dans les Statistiques.
  const entriesSociete = entries.filter((e) => e.caisse === "societe");
  const entriesBrahim = entries.filter((e) => e.caisse === "brahim");

  // Contrairement à la caisse société (qui se lit mois par mois), l'avance de Brahim est un
  // solde qui court sans jamais se remettre à zéro au changement de mois — Kamel, 2026-09-09 :
  // avait donné 2000 MAD fin juillet, et le solde affiché en septembre l'ignorait complètement
  // parce que les totaux étaient calculés uniquement sur les mouvements du mois sélectionné.
  // Les cartes de résumé portent donc sur tout l'historique ; seule la liste "Mouvements"
  // reste filtrée par mois pour rester lisible.
  const entriesBrahimTout = (
    await db
      .select({
        id: cashEntries.id,
        type: cashEntries.type,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
      })
      .from(cashEntries)
      .where(eq(cashEntries.caisse, "brahim"))
  );

  // Même logique que ci-dessus, mais pour la caisse société : le solde ("Solde société", "Total
  // confié", "Total restitué") doit courir depuis la dernière réconciliation ("on repart de
  // zéro"), pas depuis le début du mois affiché — voir reconcilierCaisseSociete. Kamel,
  // 2026-09-16 : après un vrai règlement avec le boss, un mois sans nouvelle remise affichait
  // quand même un déficit à cause des dépenses du mois, alors qu'il ne devait plus rien.
  const entriesSocieteTout = await db
    .select({
      type: cashEntries.type,
      financePar: cashEntries.financePar,
      moyenPaiement: cashEntries.moyenPaiement,
      montant: cashEntries.montant,
      devise: cashEntries.devise,
      createdAt: cashEntries.createdAt,
    })
    .from(cashEntries)
    .where(eq(cashEntries.caisse, "societe"));

  const dernieresReconciliations = await db
    .select({ moyenPaiement: caisseReconciliations.moyenPaiement, resetAt: caisseReconciliations.resetAt })
    .from(caisseReconciliations)
    .orderBy(desc(caisseReconciliations.resetAt));
  const resetAtParMoyen: Record<string, Date> = {};
  for (const r of dernieresReconciliations) {
    if (!resetAtParMoyen[r.moyenPaiement]) resetAtParMoyen[r.moyenPaiement] = r.resetAt;
  }

  const especes = entriesSociete.filter((e) => e.moyenPaiement === "especes");
  const virement = entriesSociete.filter((e) => e.moyenPaiement === "virement");
  const carte = entriesSociete.filter((e) => e.moyenPaiement === "carte");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>
          <p className="text-sm text-muted-foreground">Argent confié, dépenses et restitutions</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-card p-0.5">
              <Link
                href={moisHref("/caisse", subMonths(moisAncre, 1))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Période précédente"
                title="Période précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <p className="min-w-32 px-1.5 text-center text-sm font-medium capitalize">
                {format(moisAncre, "MMMM yyyy", { locale: fr })}
              </p>
              <Link
                href={moisHref("/caisse", addMonths(moisAncre, 1))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Période suivante"
                title="Période suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={moisHref("/caisse/rapport", moisAncre)}>
                <FileText className="h-4 w-4" />
                Rapport PDF
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(debutMois, "d MMM", { locale: fr })} → {format(finAffichee, "d MMM yyyy", { locale: fr })}
          </p>
        </div>
      </div>

      <Tabs defaultValue="especes">
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="especes" className="shrink-0">Espèces</TabsTrigger>
          <TabsTrigger value="virement" className="shrink-0">Virement bancaire</TabsTrigger>
          <TabsTrigger value="carte" className="shrink-0">Carte bleue</TabsTrigger>
          <TabsTrigger value="brahim" className="shrink-0">Brahim</TabsTrigger>
          <TabsTrigger value="stats" className="shrink-0">Statistiques</TabsTrigger>
        </TabsList>
        <TabsContent value="especes" className="pt-2">
          <CaissePanel
            entries={especes}
            entriesRunningSociete={entriesSocieteTout.filter((e) => e.moyenPaiement === "especes")}
            resetAt={resetAtParMoyen.especes ?? null}
            villas={allVillas}
            reservations={recentReservations}
            moyenPaiement="especes"
          />
        </TabsContent>
        <TabsContent value="virement" className="pt-2">
          <CaissePanel
            entries={virement}
            entriesRunningSociete={entriesSocieteTout.filter((e) => e.moyenPaiement === "virement")}
            resetAt={resetAtParMoyen.virement ?? null}
            villas={allVillas}
            reservations={recentReservations}
            moyenPaiement="virement"
          />
        </TabsContent>
        <TabsContent value="carte" className="pt-2">
          <CaissePanel
            entries={carte}
            entriesRunningSociete={entriesSocieteTout.filter((e) => e.moyenPaiement === "carte")}
            resetAt={resetAtParMoyen.carte ?? null}
            villas={allVillas}
            reservations={recentReservations}
            moyenPaiement="carte"
          />
        </TabsContent>
        <TabsContent value="brahim" className="pt-2">
          <BrahimPanel entries={entriesBrahim} allEntries={entriesBrahimTout} villas={allVillas} />
        </TabsContent>
        <TabsContent value="stats" className="pt-2">
          <CaisseStats entries={entriesSociete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CaissePanel({
  entries,
  entriesRunningSociete,
  resetAt,
  villas,
  reservations,
  moyenPaiement,
}: {
  entries: Entry[];
  // Tout l'historique société de ce moyen de paiement (pas juste le mois affiché), pour calculer
  // le solde depuis la dernière réconciliation — voir commentaire sur caisseReconciliations.
  entriesRunningSociete: { type: string; financePar: string; montant: string; devise: string; createdAt: Date }[];
  resetAt: Date | null;
  villas: { id: string; nom: string; numero: string }[];
  reservations: { id: string; guestName: string; villaId: string | null; villaNom: string | null; villaNumero: string | null }[];
  moyenPaiement: "especes" | "virement" | "carte";
}) {
  // Des montants dans des devises différentes ne doivent jamais être additionnés ensemble
  // (ex. 13000 MAD + 6400 EUR n'a aucun sens) : un jeu de totaux par devise présente. Si la
  // période n'a aucun mouvement, on affiche quand même les cartes à 0 (par défaut en MAD) —
  // sinon la section entière disparaît, ce qui donne l'impression que la page est cassée.
  const devises = entries.length > 0 ? Array.from(new Set(entries.map((e) => e.devise))).sort() : ["MAD"];
  const depuisReconciliation = resetAt ? entriesRunningSociete.filter((e) => e.createdAt >= resetAt) : entriesRunningSociete;

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
        const totalDepenseLoyers = enDevise
          .filter((e) => e.type === "depense" && e.financePar === "loyers_perso")
          .reduce((s, e) => s + Number(e.montant), 0);

        // Solde société : calculé depuis la dernière réconciliation ("on repart de zéro"), pas
        // depuis le début du mois affiché — sinon un mois sans nouvelle remise affiche un déficit
        // même quand tout a déjà été réglé avec le boss. Kamel, 2026-09-16.
        const enDeviseReconcilie = depuisReconciliation.filter((e) => e.devise === devise);
        const totalRemise = enDeviseReconcilie.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
        // Seules les dépenses financées par l'avance société comptent contre le solde société —
        // une dépense payée avec les loyers personnels de Kamel n'est pas une dette de la société
        // envers lui (voir cashFinanceParEnum dans db/schema.ts), donc exclue de ce calcul.
        const totalDepenseSociete = enDeviseReconcilie
          .filter((e) => e.type === "depense" && e.financePar === "societe")
          .reduce((s, e) => s + Number(e.montant), 0);
        const totalRestitution = enDeviseReconcilie
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Société (confié / dépenses){" "}
                  {resetAt ? (
                    <span className="normal-case text-muted-foreground/80">
                      · depuis le {format(resetAt, "d MMM yyyy", { locale: fr })}
                    </span>
                  ) : null}
                </p>
                <CaisseReconciliationButton moyenPaiement={moyenPaiement} />
              </div>
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

// Caisse séparée de Brahim (jardinier / coursier) : sa propre avance, jamais mélangée à la
// caisse société — demande explicite du patron, un onglet à part entière (2026-08-12).
function BrahimPanel({
  entries,
  allEntries,
  villas,
}: {
  entries: Entry[];
  allEntries: { id: string; type: string; montant: string; devise: string }[];
  villas: { id: string; nom: string; numero: string }[];
}) {
  // Toujours afficher au moins les cartes en MAD, même sans mouvement sur la période —
  // pareil que CaissePanel, pour ne pas donner l'impression d'un onglet vide/cassé.
  const devises = allEntries.length > 0 ? Array.from(new Set(allEntries.map((e) => e.devise))).sort() : ["MAD"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <BrahimCashActions villas={villas} />
      </div>

      {devises.map((devise) => {
        // Solde calculé sur tout l'historique (voir commentaire plus haut) : le mois affiché
        // ne doit servir qu'à filtrer la liste des mouvements, jamais le solde lui-même.
        const enDeviseTout = allEntries.filter((e) => e.devise === devise);
        const totalRemise = enDeviseTout.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
        const totalDepense = enDeviseTout.filter((e) => e.type === "depense").reduce((s, e) => s + Number(e.montant), 0);
        const totalRestitution = enDeviseTout
          .filter((e) => e.type === "restitution")
          .reduce((s, e) => s + Number(e.montant), 0);
        const solde = totalRemise - totalDepense - totalRestitution;

        return (
          <div key={devise} className="space-y-2">
            {devises.length > 1 ? <p className="text-sm font-medium text-muted-foreground">{devise}</p> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Solde Brahim" value={solde} devise={devise} highlight />
              <SummaryCard label="Total confié" value={totalRemise} devise={devise} />
              <SummaryCard label="Total restitué" value={totalRestitution} devise={devise} />
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
