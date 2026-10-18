import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ContratForm } from "@/components/app/contrat-form";
import { chargerContrat } from "@/lib/contrat-donnees";

export default async function PublicContratPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contrat = await chargerContrat(id);
  if (!contrat) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      {contrat.statut === "signe" ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium">Ces conditions ont déjà été signées. Merci.</p>
        </div>
      ) : (
        <ContratForm
          contratId={contrat.id}
          conditions={contrat.conditions}
          signatureAgenceImage={contrat.signatureAgenceImage}
        />
      )}
    </div>
  );
}
