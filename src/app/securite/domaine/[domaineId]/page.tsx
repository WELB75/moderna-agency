import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { SecuriteShell } from "@/components/app/securite-shell";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getVillasSecurityDataForDomaine } from "@/lib/security-data";

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
    <SecuriteShell
      eyebrow={`Contrôle sécurité — ${data.domaineNom}`}
      subtitle={jourSeulement ? "Arrivées du jour uniquement. Lien toujours à jour." : "Toutes les villas du domaine. Lien toujours à jour."}
    >
      {data.villas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Users className="h-8 w-8" />
          <p className="text-sm">{jourSeulement ? "Aucune arrivée aujourd'hui pour ce domaine." : "Aucune villa pour ce domaine."}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {data.villas.map((v) => (
            <div key={v.villaId} className="py-5 first:pt-0 last:pb-0 print:py-6">
              <VillaSecurityBlock data={v} />
            </div>
          ))}
        </div>
      )}
    </SecuriteShell>
  );
}
