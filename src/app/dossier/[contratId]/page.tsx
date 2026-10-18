import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { gendarmerieForms, reservations } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { DossierFlow } from "@/components/app/dossier-flow";
import { chargerContrat } from "@/lib/contrat-donnees";

// Le scan passeport (GendarmerieForm dans DossierFlow) lit la MRZ via OCR local (voir
// passport-ocr.ts) : plus lent que le timeout par défaut des Server Actions sur cette page,
// surtout à froid.
export const maxDuration = 60;

export default async function DossierPage({ params }: { params: Promise<{ contratId: string }> }) {
  const { contratId } = await params;
  const contrat = await chargerContrat(contratId);
  if (!contrat) notFound();

  const db = getDb();
  const forms = (
    await db
      .select({
        id: gendarmerieForms.id,
        statut: gendarmerieForms.statut,
        nbAdultesPrevu: gendarmerieForms.nbAdultesPrevu,
        nbEnfantsPrevu: gendarmerieForms.nbEnfantsPrevu,
        nbAdultesResa: reservations.nbAdultes,
        nbEnfantsResa: reservations.nbEnfants,
      })
      .from(gendarmerieForms)
      .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
      .where(eq(gendarmerieForms.contratId, contratId))
      .orderBy(asc(gendarmerieForms.createdAt))
  ).map((f) => ({
    id: f.id,
    statut: f.statut,
    nbAdultes: f.nbAdultesResa ?? f.nbAdultesPrevu ?? contrat.nbAdultes ?? 1,
    nbEnfants: f.nbEnfantsResa ?? f.nbEnfantsPrevu ?? contrat.nbEnfants ?? 0,
  }));

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
        <DossierFlow
          forms={forms}
          villaNom={contrat.villaNom ?? "votre logement"}
          contratId={contrat.id}
          conditions={contrat.conditions}
          signatureAgenceImage={contrat.signatureAgenceImage}
        />
      )}
    </div>
  );
}
