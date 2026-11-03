import { chargerContexteOptions, lignesDeLaReservation } from "@/lib/compta-reservation";
import type { ContexteOptions, LigneFacture } from "@/lib/compta-reservation-format";
import { OptionsFacturees } from "@/components/app/options-facturees";

async function lireDonnees(reservationId: string): Promise<{ lignes: LigneFacture[]; contexte: ContexteOptions & { montantPaye: number | null } } | null> {
  try {
    const [lignes, contexte] = await Promise.all([lignesDeLaReservation(reservationId), chargerContexteOptions(reservationId)]);
    return contexte ? { lignes, contexte } : null;
  } catch (err) {
    // Une erreur de lecture ne doit jamais casser la carte du tableau de bord : on n'affiche rien.
    console.error("Carte réservation : options facturées illisibles", err);
    return null;
  }
}

// Charge les lignes facturées et les tarifs du logement, puis affiche les cases à cocher.
export async function OptionsFactureesServeur({ reservationId, devise }: { reservationId: string; devise: string }) {
  const donnees = await lireDonnees(reservationId);
  if (!donnees) return null;
  const { lignes, contexte } = donnees;
  return (
    <OptionsFacturees
      reservationId={reservationId}
      lignes={lignes}
      devise={devise || "EUR"}
      loyerTotal={contexte.loyerTotal}
      montantPaye={contexte.montantPaye}
      fraisMenage={contexte.fraisMenage}
      tarifs={contexte.tarifs}
    />
  );
}
