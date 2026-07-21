import { Logo } from "@/components/app/logo";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getAllVillasSecurityData } from "@/lib/security-data";
import { ShieldCheck } from "lucide-react";

// Force le rendu dynamique : sans ça, cette page (sans paramètre d'URL) serait figée en
// statique au build et ne refléterait jamais les nouveaux occupants enregistrés.
export const dynamic = "force-dynamic";

// Un seul lien général pour toutes les villas : la sécurité n'a besoin que de celui-ci,
// toujours à jour, pas d'un lien différent par villa ou par arrivée.
export default async function SecuriteGeneralPage() {
  const groups = await getAllVillasSecurityData();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Contrôle sécurité — toutes les villas
        </div>
        <p className="text-xs text-muted-foreground">
          Un seul lien, toujours à jour. Déplie une villa pour voir ses derniers occupants enregistrés.
        </p>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.domaineNom} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.domaineNom}
            </h2>
            <div className="space-y-2">
              {group.villas.map((v) => (
                <details key={v.villaId} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
                    <span className="font-medium">
                      {v.villaNom} (n°{v.villaNumero})
                    </span>
                    <span className="text-xs text-muted-foreground group-open:hidden">Voir</span>
                    <span className="hidden text-xs text-muted-foreground group-open:inline">Masquer</span>
                  </summary>
                  <div className="border-t p-4 pt-3">
                    <VillaSecurityBlock data={v} showVillaHeader={false} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de contrôle Moderna Agency</p>
    </div>
  );
}
