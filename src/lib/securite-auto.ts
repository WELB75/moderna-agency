import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contratsLocation, domaines, gendarmerieForms, reservations, villas } from "@/db/schema";
import { estSejourFamille } from "@/lib/arrivees-documents";
import { getBaseUrl } from "@/lib/base-url";
import { sendWhatsAppTemplate } from "@/lib/whatsapp-agent/send";

// Message sécurité automatique (Kamel, 2026-11-05) : il part tout seul vers le gardien du domaine
// (Domaine Moderna II, Zaraba = Moderna 1...) dès que la fiche police ET le contrat sont validés.
// WhatsApp refuse le texte libre hors fenêtre de 24 h (erreur 131047, voir whatsapp_outbound_messages) :
// on passe donc par le modèle Meta approuvé « securite_arrivee_invite » (arabe, 5 variables).
// Séjour Famille : pas de contrat demandé, la fiche suffit.
export const MODELE_SECURITE = "securite_arrivee_invite";

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
        guestName: reservations.guestName,
        canal: reservations.canal,
        status: reservations.status,
        checkIn: reservations.checkIn,
        notifieeAt: reservations.securiteNotifieeAt,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!r || r.notifieeAt || !r.villaId || r.status === "annulee") return;

    const [villa] = await db
      .select({ nom: villas.nom, numero: villas.numero, securitePhone: domaines.securitePhone })
      .from(villas)
      .leftJoin(domaines, eq(domaines.id, villas.domaineId))
      .where(eq(villas.id, r.villaId))
      .limit(1);
    if (!villa?.securitePhone) return;

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

    const date = r.checkIn.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    const lien = `${getBaseUrl()}/securite/villa/${reservationId}`;
    const envoye = await sendWhatsAppTemplate(villa.securitePhone, MODELE_SECURITE, "ar", [r.guestName, villa.nom, villa.numero, date, lien], "securite_auto");
    if (!envoye) {
      // Échec (modèle pas encore approuvé, réseau...) : on libère, le prochain événement réessaiera.
      await db.update(reservations).set({ securiteNotifieeAt: null }).where(eq(reservations.id, reservationId));
    }
  } catch (err) {
    console.error("Échec notification sécurité automatique:", err);
  }
}
