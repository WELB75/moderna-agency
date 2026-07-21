import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { contratsLocation, villas } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { ContratForm } from "@/components/app/contrat-form";

export default async function PublicContratPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [contrat] = await db
    .select({
      id: contratsLocation.id,
      statut: contratsLocation.statut,
      agenceRepresentant: contratsLocation.agenceRepresentant,
      locataireNom: contratsLocation.locataireNom,
      locataireAdresse: contratsLocation.locataireAdresse,
      dateArrivee: contratsLocation.dateArrivee,
      dateDepart: contratsLocation.dateDepart,
      devise: contratsLocation.devise,
      montantTotal: contratsLocation.montantTotal,
      acompteMontant: contratsLocation.acompteMontant,
      soldeMontant: contratsLocation.soldeMontant,
      soldeDateLimite: contratsLocation.soldeDateLimite,
      depotGarantieMontant: contratsLocation.depotGarantieMontant,
      depotRestitutionDate: contratsLocation.depotRestitutionDate,
      lieuSignature: contratsLocation.lieuSignature,
      dateSignatureAgence: contratsLocation.dateSignatureAgence,
      signatureAgenceImage: contratsLocation.signatureAgenceImage,
      signatureAgenceNom: contratsLocation.signatureAgenceNom,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaAdresse: villas.adresse,
    })
    .from(contratsLocation)
    .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
    .where(eq(contratsLocation.id, id))
    .limit(1);

  if (!contrat) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      {contrat.statut === "signe" ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium">Ce contrat a déjà été signé. Merci.</p>
        </div>
      ) : (
        <ContratForm contrat={contrat} />
      )}
    </div>
  );
}
