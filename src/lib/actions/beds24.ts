"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { runBeds24Sync } from "@/lib/beds24/sync";

// Déclenchement manuel depuis le tableau de bord (bouton dans "Options"), même principe que
// triggerIcalSync — utile tant qu'aucun cron n'est en place, notamment pour valider la connexion
// Beds24 sur la propriété test avant de migrer une vraie villa.
export async function triggerBeds24Sync() {
  await auth.protect();
  const result = await runBeds24Sync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? {
        success: true,
        message:
          `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s) connectée(s) à Beds24)` +
          (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
          ".",
      }
    : { success: false, message: result.error };
}
