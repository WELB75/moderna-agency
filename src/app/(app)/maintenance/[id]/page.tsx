import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { domaines, interventionComments, interventions, technicians, villas } from "@/db/schema";
import { InterventionCard } from "@/components/app/intervention-card";
import { CopyLinkButton } from "@/components/app/copy-link-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Détail complet d'une intervention (lien partageable depuis « Derniers signalements »,
// Kamel, 2026-11-07) : la même carte que dans la liste, avec photos, devis, commentaires et étapes.
export default async function InterventionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = getDb();
  const [intervention] = await db
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
    .where(eq(interventions.id, id))
    .limit(1);
  if (!intervention) notFound();

  const [allTechnicians, comments, user] = await Promise.all([
    db.select({ id: technicians.id, nom: technicians.nom, fonction: technicians.fonction }).from(technicians),
    db.select().from(interventionComments).where(eq(interventionComments.interventionId, id)).orderBy(asc(interventionComments.createdAt)),
    currentUser(),
  ]);
  const currentUserName = user?.fullName ?? user?.username ?? "Équipe";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/maintenance" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Maintenance
        </Link>
        <CopyLinkButton path={`/maintenance/${id}`} label="Copier le lien" successMessage="Lien du signalement copié." />
      </div>
      <InterventionCard intervention={intervention} comments={comments} currentUserName={currentUserName} technicians={allTechnicians} />
    </div>
  );
}
