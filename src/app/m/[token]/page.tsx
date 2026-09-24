import { desc, eq, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { villas, technicians, interventions, domaines, proprieteContacts } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddInterventionDialog } from "@/components/app/add-intervention-dialog";
import { InterventionCard } from "@/components/app/intervention-card";
import { VillaFilterView, type VillaGroup } from "@/components/app/villa-filter-view";
import { sortByUrgence } from "@/lib/intervention-urgence";
import { filtrerDomainesActifs, domaineEstActif, idsDomainesActifs, idsVillasActives } from "@/lib/domaines-actifs";
import { isValidMaintenanceToken } from "@/lib/maintenance-access-token";
import { Clock, CheckCircle2 } from "lucide-react";

// Espace maintenance public — même contenu que l'onglet "Tâches" de l'app interne (/maintenance),
// mais accessible sans compte Clerk via un jeton unique partagé (voir maintenance-access-token.ts)
// pour que l'équipe sur le terrain (technicien, responsable...) puisse suivre, changer un statut
// et ajouter des photos depuis son téléphone.
export default async function MaintenanceSpacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidMaintenanceToken(token)) notFound();

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
        villaId: interventions.villaId,
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

  const tachesEnAttente = villaInterventions.filter((i) => i.etape !== "termine");
  const tachesTerminees = villaInterventions
    .filter((i) => i.etape === "termine")
    .sort((a, b) => new Date(b.finAt ?? b.createdAt).getTime() - new Date(a.finAt ?? a.createdAt).getTime());

  function renderVillaGroups(list: typeof villaInterventions): VillaGroup[] {
    const villaIds = [...new Set(list.map((i) => i.villaId).filter((id): id is string => !!id))];
    return villaIds
      .map((villaId): VillaGroup => {
        const items = list.filter((i) => i.villaId === villaId);
        const { villaNom, villaNumero } = items[0];
        return {
          villaId,
          label: villaNom ? `${villaNom} (n°${villaNumero})` : "Villa inconnue",
          count: items.length,
          content: (
            <div className="space-y-2">
              {sortByUrgence(items).map((i) => (
                <InterventionCard key={i.id} intervention={i} technicians={allTechnicians} token={token} />
              ))}
            </div>
          ),
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">Espace maintenance</p>
      </div>

      <div className="flex items-center justify-end">
        <AddInterventionDialog villas={allVillas} domaines={allDomaines} technicians={allTechnicians} contacts={allContacts} token={token} />
      </div>

      {villaInterventions.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Aucune tâche pour l&apos;instant.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-center">
              <p className="text-2xl font-semibold leading-none">{tachesEnAttente.length}</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                En attente
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-3 text-center">
              <p className="text-2xl font-semibold leading-none">{tachesTerminees.length}</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" />
                Terminées
              </p>
            </div>
          </div>

          <Tabs defaultValue="a-faire">
            <TabsList>
              <TabsTrigger value="a-faire">À faire ({tachesEnAttente.length})</TabsTrigger>
              <TabsTrigger value="termine">Terminé ({tachesTerminees.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="a-faire" className="space-y-4">
              {tachesEnAttente.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Tout est réglé, aucune tâche en attente.</p>
              ) : (
                <VillaFilterView groups={renderVillaGroups(tachesEnAttente)} />
              )}
            </TabsContent>

            <TabsContent value="termine" className="space-y-2">
              {tachesTerminees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune tâche terminée pour l&apos;instant.</p>
              ) : (
                tachesTerminees.map((i) => (
                  <InterventionCard key={i.id} intervention={i} technicians={allTechnicians} token={token} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
