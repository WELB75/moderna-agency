import { getTarification } from "@/lib/pricelabs/sync";
import { TarificationView } from "@/components/app/tarification-view";

export default async function CalendrierPage() {
  // Rendu initial avec le cache déjà en base (pas d'appel PriceLabs bloquant au chargement de la
  // page) — le bouton "Actualiser les prix" côté client force une resynchro à la demande.
  const villasTarifs = await getTarification();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
        <p className="text-sm text-muted-foreground">Prix et réservations en direct de chaque villa, synchronisés depuis PriceLabs.</p>
      </div>
      <TarificationView initialVillas={villasTarifs} />
    </div>
  );
}
