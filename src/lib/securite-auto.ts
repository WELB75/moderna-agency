import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, reservations, villas } from "@/db/schema";
import { estSejourFamille } from "@/lib/arrivees-documents";
import { envoyerSecuriteReservation, getAgentsSecurite } from "@/lib/securite-agents";

// Message sécurité automatique (Kamel, 2026-11-05) : il part tout seul vers le gardien du domaine
// (Domaine Moderna II, Zaraba = Moderna 1...) dès que la fiche police ET le contrat sont validés.
// WhatsApp refuse le texte libre hors fenêtre de 24 h (erreur 131047, voir whatsapp_outbound_messages) :
// on passe donc par le modèle Meta approuvé « securite_arrivee_invite » (arabe, 5 variables).
// Séjour Famille : pas de contrat demandé, la fiche suffit.
// 2026-11-06 : envoi à TOUS les agents du domaine (voir lib/securite-agents.ts).
export { MODELE_SECURITE } from "@/lib/securite-agents";

// À appeler après chaque événement qui peut rendre le dossier complet (fiche terminée, contrat
// signé). Idempotent : ne fait rien si le gardien a déjà été prévenu ou si un élément manque.
// Ne lève jamais d'erreur : ne doit pas bloquer le voyageur qui signe ou remplit sa fiche.
export async function notifierSecuriteSiPret(reservationId: string | null | undefined): Promise<void> {
  if (!reservationId) return;
  try {
    const db = getDb();
    const [r] = await db
      .select({
        villaId: reservations.villaId,
        canal: reservations.canal,
        status: reservations.status,
        checkIn: reservations.checkIn,
        notifieeAt: reservations.securiteNotifieeAt,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!r || r.notifieeAt || !r.villaId || r.status === "annulee") return;

    const [villa] = await db.select({ domaineId: villas.domaineId }).from(villas).where(eq(villas.id, r.villaId)).limit(1);
    if (!villa?.domaineId) return;
    const agents = (await getAgentsSecurite([villa.domaineId])).get(villa.domaineId) ?? [];
    if (agents.length === 0) return;

    const fiches = await db
      .select({ id: gendarmerieForms.id })
      .from(gendarmerieForms)
      .where(and(eq(gendarmerieForms.reservationId, reservationId), eq(gendarmerieForms.statut, "complete")))
      .limit(1);
    if (fiches.length === 0) return;

    if (!estSejourFamille(r.canal)) {
      const jour = r.checkIn.toISOString().slice(0, 10);
      const contrats = await db
        .select({ id: contratsLocation.id })
        .from(contratsLocation)
        .where(and(eq(contratsLocation.villaId, r.villaId), eq(contratsLocation.dateArrivee, jour), eq(contratsLocation.statut, "signe")))
        .limit(1);
      if (contrats.length === 0) return;
    }

    // Réservation du message avant l'envoi : deux événements simultanés (fiche et contrat)
    // n'envoient qu'un seul message.
    const reserve = await db
      .update(reservations)
      .set({ securiteNotifieeAt: new Date() })
      .where(and(eq(reservations.id, reservationId), isNull(reservations.securiteNotifieeAt)))
      .returning({ id: reservations.id });
    if (reserve.length === 0) return;

    const { resultats } = await envoyerSecuriteReservation(reservationId, "auto");
    if (!resultats.some((x) => x.ok)) {
      // Échec (modèle pas encore approuvé, réseau...) : on libère, le prochain événement réessaiera.
      await db.update(reservations).set({ securiteNotifieeAt: null }).where(eq(reservations.id, reservationId));
    }
  } catch (err) {
    console.error("Échec notification sécurité automatique:", err);
  }
}
