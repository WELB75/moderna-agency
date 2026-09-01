import { notFound } from "next/navigation";
import { SecuriteShell } from "@/components/app/securite-shell";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { getReservationSecurityData } from "@/lib/security-data";

// Lien propre à cette réservation précise (voir getReservationSecurityData) : jamais de "dernier
// séjour connu" d'un autre client, même une fois ce séjour terminé. Kamel, 2026-08-20.
export default async function SecuriteReservationPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const data = await getReservationSecurityData(reservationId);

  if (!data) notFound();

  return (
    <SecuriteShell eyebrow="Contrôle sécurité — accès domaine" subtitle="Ce lien concerne uniquement ce séjour.">
      <VillaSecurityBlock data={data} />
    </SecuriteShell>
  );
}
