import { desc, eq, asc, inArray } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { interventions, villas, domaines, technicians, proprieteContacts, interventionComments } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { AddInterventionDialog } from "@/components/app/add-intervention-dialog";
import { InterventionCard } from "@/components/app/intervention-card";
import { CategorieFilterView, type CategorieGroup } from "@/components/app/categorie-filter-view";
import { sortByUrgence } from "@/lib/intervention-urgence";
import { CATEGORIES } from "@/lib/intervention-categorie";
import { Gauge } from "lucide-react";

export default async function InterventionsPage() {
  const db = getDb();
  const user = await currentUser();
  const currentUserName = user?.fullName ?? user?.username ?? "Équipe";

  const allInterventions = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      lieu: interventions.lieu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineId: interventions.domaineId,
      domaineNom: domaines.nom,
      domaineMapsUrl: domaines.mapsUrl,
      prestataire: interventions.prestataire,
      technicianId: interventions.technicianId,
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
      createdByName: interventions.createdByName,
      createdAt: interventions.createdAt,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .orderBy(desc(interventions.createdAt));

  const allVillas = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineId: villas.domaineId })
    .from(villas);
  const allDomaines = await db.select().from(domaines).orderBy(asc(domaines.nom));
  const allTechnicians = await db
    .select({ id: technicians.id, nom: technicians.nom, fonction: technicians.fonction })
    .from(technicians);
  const allContacts = await db
    .select({
      villaId: proprieteContacts.villaId,
      domaineId: proprieteContacts.domaineId,
      nom: proprieteContacts.nom,
      role: proprieteContacts.role,
    })
    .from(proprieteContacts);

  const interventionIds = allInterventions.map((i) => i.id);
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
    const list = commentsByIntervention.get(c.interventionId) ?? [];
    list.push(c);
    commentsByIntervention.set(c.interventionId, list);
  }

  // Sépare en cours / terminées pour ne pas mélanger l'historique clos avec ce qui reste à suivre.
  function renderList(list: typeof allInterventions) {
    const enCours = sortByUrgence(list.filter((i) => i.etape !== "termine"));
    const terminees = sortByUrgence(list.filter((i) => i.etape === "termine"));

    return (
      <div className="space-y-6">
        {enCours.length > 0 ? (
          <div className="space-y-2">
            {enCours.map((i) => (
              <InterventionCard
                key={i.id}
                intervention={i}
                comments={commentsByIntervention.get(i.id) ?? []}
                currentUserName={currentUserName}
                technicians={allTechnicians}
              />
            ))}
          </div>
        ) : null}

        {terminees.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Terminées</p>
            {terminees.map((i) => (
              <InterventionCard
                key={i.id}
                intervention={i}
                comments={commentsByIntervention.get(i.id) ?? []}
                currentUserName={currentUserName}
                technicians={allTechnicians}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // Regroupe par catégorie : au premier coup d'œil on ne voit que les tuiles de
  // catégorie, on clique dessus pour tomber sur le détail en cours/terminées.
  function renderCategorieGroups(list: typeof allInterventions): CategorieGroup[] {
    return CATEGORIES.map((c): CategorieGroup | null => {
      const items = list.filter((i) => i.categorie === c.key);
      if (items.length === 0) return null;
      const count = items.filter((i) => i.etape !== "termine").length;
      return { categorie: c.key, count, content: renderList(items) };
    }).filter((g): g is CategorieGroup => g !== null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interventions</h1>
          <p className="text-sm text-muted-foreground">Suivi étape par étape</p>
        </div>
        <AddInterventionDialog
          villas={allVillas}
          domaines={allDomaines}
          technicians={allTechnicians}
          contacts={allContacts}
        />
      </div>

      {allInterventions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Gauge className="h-8 w-8" />
            <p>Aucune intervention pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : (
        <CategorieFilterView groups={renderCategorieGroups(allInterventions)} />
      )}
    </div>
  );
}
