import { getTarification } from "@/lib/pricelabs/sync";
import { DevisRapide } from "@/components/app/devis-rapide";

// Page "Devis rapide", entrée de menu juste sous "Nouvelle réservation" — auparavant un bloc en
// haut du Calendrier (vue planning). Mêmes données que le planning : prix PriceLabs et nuits déjà
// prises, lus depuis le cache en base (Kamel, 2026-10-17).
export default async function DevisPage() {
  const villas = await getTarification();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devis rapide</h1>
        <p className="text-sm text-muted-foreground">
          Choisis un logement et des dates : disponibilité et prix total calculés depuis PriceLabs.
        </p>
      </div>
      <div className="max-w-3xl">
        <DevisRapide villas={villas} />
      </div>
    </div>
  );
}
