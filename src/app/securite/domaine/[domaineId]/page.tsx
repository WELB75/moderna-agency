import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getVillasSecurityDataForDomaine } from "@/lib/security-data";
import { ShieldCheck } from "lucide-react";

// Lien par domaine (pas par villa individuelle) : chaque domaine a ses propres agents de
// sécurité, on ne mélange jamais les villas de deux domaines différents sur un même lien.
export default async function SecuriteDomainePage({
  params,
  searchParams,
}: {
  params: Promise<{ domaineId: string }>;
  searchParams: Promise<{ jour?: string }>;
}) {
  const { domaineId } = await params;
  const { jour } = await searchParams;
  const jourSeulement = jour === "1";

  const data = await getVillasSecurityDataForDomaine(domaineId, { jourSeulement });
  if (!data) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Contrôle sécurité — {data.domaineNom}
        </div>
        <p className="text-xs text-muted-foreground">
          {jourSeulement
            ? "Arrivées du jour uniquement. Lien toujours à jour."
            : "Toutes les villas du domaine. Lien toujours à jour."}
        </p>
      </div>

      {data.villas.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          {jourSeulement ? "Aucune arrivée aujourd'hui pour ce domaine." : "Aucune villa pour ce domaine."}
        </p>
      ) : (
        <div className="space-y-3">
          {data.villas.map((v) => (
            <div key={v.villaId} className="rounded-lg border p-4">
              <VillaSecurityBlock data={v} />
            </div>
          ))}
        </div>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de contrôle Moderna Agency</p>
    </div>
  );
}
