import { getTarification } from "@/lib/pricelabs/sync";
import { appliquerPrixDirect } from "@/lib/pricelabs/direct";
import { DevisRapide } from "@/components/app/devis-rapide";

// Page "Devis rapide", entrée de menu juste sous "Nouvelle réservation" — auparavant un bloc en
// haut du Calendrier (vue planning). Mêmes données que le planning : prix PriceLabs et nuits déjà
// prises, lus depuis le cache en base (Kamel, 2026-10-17).
export default async function DevisPage() {
  // Prix directs : certains logements ont une fourchette propre en direct (lib/prix-direct.ts).
  const villas = await appliquerPrixDirect(await getTarification());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devis rapide</h1>
        <p className="text-sm text-muted-foreground">
          Choisis un logement et des dates : disponibilité et prix total calculés depuis PriceLabs.
        </p>
      </div>
      <DevisRapide villas={villas} />
    </div>
  );
}
