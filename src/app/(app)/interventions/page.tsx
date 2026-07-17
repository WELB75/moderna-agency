import { desc, eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { interventions, villas, domaines, technicians } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { AddInterventionDialog } from "@/components/app/add-intervention-dialog";
import { InterventionCard } from "@/components/app/intervention-card";
import { Gauge } from "lucide-react";

export default async function InterventionsPage() {
  const db = getDb();

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
      etape: interventions.etape,
      notes: interventions.notes,
      attachmentUrls: interventions.attachmentUrls,
      signaleAt: interventions.signaleAt,
      contacteAt: interventions.contacteAt,
      planifieAt: interventions.planifieAt,
      debutAt: interventions.debutAt,
      finAt: interventions.finAt,
      createdByName: interventions.createdByName,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .orderBy(desc(interventions.createdAt));

  const enCours = allInterventions.filter((i) => i.etape !== "termine");
  const terminees = allInterventions.filter((i) => i.etape === "termine");

  const allVillas = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas);
  const allDomaines = await db.select().from(domaines).orderBy(asc(domaines.nom));
  const allTechnicians = await db.select({ nom: technicians.nom, fonction: technicians.fonction }).from(technicians);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interventions</h1>
          <p className="text-sm text-muted-foreground">Suivi étape par étape</p>
        </div>
        <AddInterventionDialog villas={allVillas} domaines={allDomaines} technicians={allTechnicians} />
      </div>

      {allInterventions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Gauge className="h-8 w-8" />
            <p>Aucune intervention pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {enCours.length > 0 ? (
            <div className="space-y-2">
              {enCours.map((i) => (
                <InterventionCard key={i.id} intervention={i} />
              ))}
            </div>
          ) : null}

          {terminees.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Terminées</p>
              {terminees.map((i) => (
                <InterventionCard key={i.id} intervention={i} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
