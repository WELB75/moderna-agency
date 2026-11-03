import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { lignesDeLaReservation } from "@/lib/compta-reservation";
import type { LigneFacture } from "@/lib/compta-reservation-format";
import { OptionsFacturees } from "@/components/app/options-facturees";

async function lireDonnees(reservationId: string): Promise<{ lignes: LigneFacture[]; loyerTotal: number | null; montantPaye: number | null } | null> {
  try {
    const [lignes, [r]] = await Promise.all([
      lignesDeLaReservation(reservationId),
      getDb()
        .select({ loyerTotal: reservations.loyerTotal, montantPaye: reservations.montantPaye })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .limit(1),
    ]);
    return {
      lignes,
      loyerTotal: r?.loyerTotal != null ? Number(r.loyerTotal) : null,
      montantPaye: r?.montantPaye != null ? Number(r.montantPaye) : null,
    };
  } catch (err) {
    // Une erreur de lecture ne doit jamais casser la carte du tableau de bord : on n'affiche rien.
    console.error("Carte réservation : options facturées illisibles", err);
    return null;
  }
}

// Charge les lignes facturées d'une réservation puis affiche les cases à cocher.
export async function OptionsFactureesServeur({ reservationId, devise }: { reservationId: string; devise: string }) {
  const donnees = await lireDonnees(reservationId);
  if (!donnees) return null;
  return <OptionsFacturees reservationId={reservationId} lignes={donnees.lignes} devise={devise || "EUR"} loyerTotal={donnees.loyerTotal} montantPaye={donnees.montantPaye} />;
}
