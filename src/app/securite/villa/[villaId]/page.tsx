import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getVillaSecurityData } from "@/lib/security-data";
import { ShieldCheck } from "lucide-react";

// Lien général et permanent par villa : montre toujours la fiche la plus récente
// remplie pour ce logement, sans avoir à renvoyer un nouveau lien à chaque arrivée.
export default async function SecuriteVillaPage({ params }: { params: Promise<{ villaId: string }> }) {
  const { villaId } = await params;
  const data = await getVillaSecurityData(villaId);

  if (!data) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Contrôle sécurité — accès domaine
        </div>
        <p className="text-xs text-muted-foreground">
          Ce lien affiche toujours les derniers occupants enregistrés pour cette villa.
        </p>
      </div>

      <VillaSecurityBlock data={data} />

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de contrôle Moderna Agency</p>
    </div>
  );
}
