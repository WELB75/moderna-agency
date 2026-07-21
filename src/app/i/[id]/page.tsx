import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { interventions, villas, domaines } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { InterventionPublicCard } from "@/components/app/intervention-public-card";

export default async function PublicInterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [intervention] = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      lieu: interventions.lieu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      prestataire: interventions.prestataire,
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
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .where(eq(interventions.id, id))
    .limit(1);

  if (!intervention) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      <InterventionPublicCard intervention={intervention} />

      <p className="text-center text-xs text-muted-foreground">
        Lien de consultation Moderna Agency
      </p>
    </div>
  );
}
