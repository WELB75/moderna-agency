import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getReservationSecurityData } from "@/lib/security-data";
import { ShieldCheck } from "lucide-react";

// Lien propre à cette réservation précise (voir getReservationSecurityData) : jamais de "dernier
// séjour connu" d'un autre client, même une fois ce séjour terminé. Kamel, 2026-08-20.
export default async function SecuriteReservationPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const data = await getReservationSecurityData(reservationId);

  if (!data) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Contrôle sécurité — accès domaine
        </div>
        <p className="text-xs text-muted-foreground">Ce lien concerne uniquement ce séjour.</p>
      </div>

      <VillaSecurityBlock data={data} />

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de contrôle Moderna Agency</p>
    </div>
  );
}
