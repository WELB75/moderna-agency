import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, technicians, interventions, domaines, proprieteContacts } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddTechnicianDialog } from "@/components/app/add-technician-dialog";
import { AddInterventionDialog } from "@/components/app/add-intervention-dialog";
import { InterventionCard } from "@/components/app/intervention-card";
import { CategorieFilterView, type CategorieGroup } from "@/components/app/categorie-filter-view";
import { computeCategorieStats } from "@/lib/categorie-stats";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { PhoneLink } from "@/components/app/phone-link";
import { deleteTechnician } from "@/lib/actions/technicians";
import { sortByUrgence } from "@/lib/intervention-urgence";
import { CATEGORIES } from "@/lib/intervention-categorie";
import { filtrerDomainesActifs, domaineEstActif, idsDomainesActifs, idsVillasActives } from "@/lib/domaines-actifs";
import { Users, ListTodo } from "lucide-react";

export default async function MaintenancePage() {
  const db = getDb();

  const allDomaines = filtrerDomainesActifs(await db.select().from(domaines).orderBy(domaines.nom));
  const domaineIdsActifs = idsDomainesActifs(allDomaines);

  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineId: villas.domaineId })
      .from(villas)
  ).filter((v) => v.domaineId && domaineIdsActifs.has(v.domaineId));
  const villaIdsActifs = idsVillasActives(allVillas, domaineIdsActifs);

  const allTechnicians = await db.select().from(technicians).orderBy(technicians.nom);
  const allContacts = (
    await db
      .select({
        villaId: proprieteContacts.villaId,
        domaineId: proprieteContacts.domaineId,
        nom: proprieteContacts.nom,
        role: proprieteContacts.role,
      })
      .from(proprieteContacts)
  ).filter(
    (c) => (!c.villaId || villaIdsActifs.has(c.villaId)) && (!c.domaineId || domaineIdsActifs.has(c.domaineId))
  );

  const villaInterventions = (
    await db
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
      .where(isNotNull(interventions.villaId))
      .orderBy(desc(interventions.createdAt))
  ).filter((i) => domaineEstActif(i.domaineNom));

  // Regroupe par catégorie : au premier coup d'œil on ne voit que les tuiles de
  // catégorie, on clique dessus pour tomber sur le détail des tâches.
  function renderCategorieGroups(list: typeof villaInterventions): CategorieGroup[] {
    return CATEGORIES.map((c): CategorieGroup | null => {
      const items = list.filter((i) => i.categorie === c.key);
      if (items.length === 0) return null;
      const count = items.filter((i) => i.etape !== "termine").length;
      return {
        categorie: c.key,
        count,
        content: (
          <div className="space-y-2">
            {sortByUrgence(items).map((i) => (
              <InterventionCard key={i.id} intervention={i} technicians={allTechnicians} />
            ))}
          </div>
        ),
      };
    }).filter((g): g is CategorieGroup => g !== null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
        <p className="text-sm text-muted-foreground">Tâches en cours et carnet des techniciens</p>
      </div>

      <Tabs defaultValue="taches">
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="techniciens" className="shrink-0">
            <Users className="h-4 w-4" />
            Techniciens
          </TabsTrigger>
          <TabsTrigger value="taches" className="shrink-0">
            <ListTodo className="h-4 w-4" />
            Tâches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="techniciens" className="space-y-6">
          <div className="flex justify-end">
            <AddTechnicianDialog />
          </div>

          {allTechnicians.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Users className="h-8 w-8" />
                <p>Aucun technicien enregistré pour l&apos;instant.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {allTechnicians.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{t.nom}</p>
                    <p className="text-sm text-muted-foreground">{t.fonction}</p>
                    {t.notes ? <p className="mt-1 text-sm text-muted-foreground">{t.notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <PhoneLink phone={t.telephone} />
                    <CopyLinkButton
                      path={`/t/${t.accessToken}`}
                      label="Copier le lien"
                      successMessage={`Lien copié — envoie-le à ${t.nom} sur WhatsApp.`}
                    />
                    <ConfirmDeleteButton
                      action={deleteTechnician.bind(null, t.id)}
                      title="Supprimer ce technicien ?"
                      description="Cette action est irréversible."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="taches" className="space-y-6">
          <div className="flex justify-end">
            <AddInterventionDialog
              villas={allVillas}
              domaines={allDomaines}
              technicians={allTechnicians}
              contacts={allContacts}
            />
          </div>

          {villaInterventions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <ListTodo className="h-8 w-8" />
                <p>Aucune tâche pour l&apos;instant.</p>
              </CardContent>
            </Card>
          ) : (
            <CategorieFilterView
              groups={renderCategorieGroups(villaInterventions)}
              stats={computeCategorieStats(villaInterventions)}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
