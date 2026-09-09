import { eq, desc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { villas, interventions, domaines, interventionComments } from "@/db/schema";
import { getDb } from "@/db";
import { Logo } from "@/components/app/logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InterventionPublicCard } from "@/components/app/intervention-public-card";
import { CategorieFilterView, type CategorieGroup } from "@/components/app/categorie-filter-view";
import { TravauxScanForm } from "@/components/app/travaux-scan-form";
import { deleteInterventionByToken } from "@/lib/actions/interventions";
import { computeCategorieStats } from "@/lib/categorie-stats";
import { sortByUrgence } from "@/lib/intervention-urgence";
import { CATEGORIES } from "@/lib/intervention-categorie";
import { ListChecks, LayoutGrid, ScanLine } from "lucide-react";

// Vitrine minimale pour suivre les travaux d'une seule villa, à 3 onglets seulement — Kamel,
// 2026-09-09 : "je veux pas le calendrier proprio, retire le, ne laisse que les travaux en
// cours, l'autre onglet les catégories, et l'autre le genre de formulaire scann ia et c'est
// tout". Même token que le lien propriétaire complet (/p/[token]), qui reste inchangé pour les
// autres usages (séjours, équipe) — celui-ci est volontairement réduit au strict nécessaire pour
// suivre et signaler des travaux, utilisable aussi bien par l'équipe que par le propriétaire.
export default async function TravauxPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const [villa] = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, proprietaireNom: villas.proprietaireNom, portailAuteurs: villas.portailAuteurs })
    .from(villas)
    .where(eq(villas.lienProprietaireToken, token))
    .limit(1);

  if (!villa) notFound();

  const commentAuthorOptions =
    villa.portailAuteurs && villa.portailAuteurs.length > 0
      ? villa.portailAuteurs
      : [villa.proprietaireNom || "Propriétaire", "Kamel"];

  const list = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      lieu: interventions.lieu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      prestataire: interventions.prestataire,
      urgence: interventions.urgence,
      categorie: interventions.categorie,
      etape: interventions.etape,
      notes: interventions.notes,
      attachmentUrls: interventions.attachmentUrls,
      devis: interventions.devis,
      signaleAt: interventions.signaleAt,
      contacteAt: interventions.contacteAt,
      planifieAt: interventions.planifieAt,
      debutAt: interventions.debutAt,
      finAt: interventions.finAt,
      validationStatut: interventions.validationStatut,
      validationNote: interventions.validationNote,
      validationAt: interventions.validationAt,
      createdAt: interventions.createdAt,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .where(eq(interventions.villaId, villa.id))
    .orderBy(desc(interventions.createdAt));

  const sorted = sortByUrgence(list);
  const enCoursList = sorted.filter((i) => i.etape !== "termine");

  const interventionIds = list.map((i) => i.id);
  const allComments =
    interventionIds.length > 0
      ? await db
          .select()
          .from(interventionComments)
          .where(inArray(interventionComments.interventionId, interventionIds))
          .orderBy(interventionComments.createdAt)
      : [];
  const commentsByIntervention = new Map<string, typeof allComments>();
  for (const c of allComments) {
    const l = commentsByIntervention.get(c.interventionId) ?? [];
    l.push(c);
    commentsByIntervention.set(c.interventionId, l);
  }

  function renderCards(items: typeof sorted) {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>;
    }
    return (
      <div className="space-y-4">
        {items.map((i) => (
          <InterventionPublicCard
            key={i.id}
            intervention={i}
            showVillaInfo={false}
            validationTitle="Validez-vous ce devis ?"
            comments={commentsByIntervention.get(i.id) ?? []}
            commentAuteur={villa.proprietaireNom || "Propriétaire"}
            commentAuteurType="proprietaire"
            commentAuthorOptions={commentAuthorOptions}
            onDelete={deleteInterventionByToken.bind(null, token, i.id)}
          />
        ))}
      </div>
    );
  }

  function renderCategorieGroups(): CategorieGroup[] {
    return CATEGORIES.map((c): CategorieGroup | null => {
      const items = sorted.filter((i) => i.categorie === c.key);
      if (items.length === 0) return null;
      const count = items.filter((i) => i.etape !== "termine").length;
      const enCours = items.filter((i) => i.etape !== "termine");
      const termines = items.filter((i) => i.etape === "termine");
      return {
        categorie: c.key,
        count,
        content: (
          <Tabs defaultValue="en_cours">
            <TabsList>
              <TabsTrigger value="en_cours">En cours ({enCours.length})</TabsTrigger>
              <TabsTrigger value="termine">Terminé ({termines.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="en_cours" className="pt-3">
              {renderCards(enCours)}
            </TabsContent>
            <TabsContent value="termine" className="pt-3">
              {renderCards(termines)}
            </TabsContent>
          </Tabs>
        ),
      };
    }).filter((g): g is CategorieGroup => g !== null);
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">
          {villa.nom} (n°{villa.numero})
        </p>
      </div>

      <Tabs defaultValue="en_cours">
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="en_cours" className="shrink-0">
            <ListChecks className="h-4 w-4" />
            En cours
            {enCoursList.length > 0 ? <span className="ml-1 text-xs">({enCoursList.length})</span> : null}
          </TabsTrigger>
          <TabsTrigger value="categories" className="shrink-0">
            <LayoutGrid className="h-4 w-4" />
            Catégories
          </TabsTrigger>
          <TabsTrigger value="ajouter" className="shrink-0">
            <ScanLine className="h-4 w-4" />
            Ajouter
          </TabsTrigger>
        </TabsList>

        <TabsContent value="en_cours" className="space-y-4 pt-2">
          {renderCards(enCoursList)}
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 pt-2">
          <CategorieFilterView groups={renderCategorieGroups()} stats={computeCategorieStats(sorted)} />
        </TabsContent>

        <TabsContent value="ajouter" className="pt-2">
          <TravauxScanForm token={token} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
