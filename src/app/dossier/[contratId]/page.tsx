import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, villas } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { DossierFlow } from "@/components/app/dossier-flow";

// Le scan passeport (GendarmerieForm dans DossierFlow) lit la MRZ via OCR local (voir
// passport-ocr.ts) : plus lent que le timeout par défaut des Server Actions sur cette page,
// surtout à froid.
export const maxDuration = 60;

export default async function DossierPage({ params }: { params: Promise<{ contratId: string }> }) {
  const { contratId } = await params;
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
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaAdresse: villas.adresse,
    })
    .from(contratsLocation)
    .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
    .where(eq(contratsLocation.id, contratId))
    .limit(1);

  if (!contrat) notFound();

  const forms = await db
    .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.contratId, contratId))
    .orderBy(gendarmerieForms.createdAt);

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      {contrat.statut === "signe" ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium">Ce dossier a déjà été complété. Merci.</p>
        </div>
      ) : (
        <DossierFlow forms={forms} villaNom={contrat.villaNom ?? "votre logement"} contrat={contrat} />
      )}
    </div>
  );
}
