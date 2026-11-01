"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, reservations, villas, domaines } from "@/db/schema";
import { normalizeIdPhotoDataUrl } from "@/lib/id-photo-normalize";
import { sendWhatsAppText } from "@/lib/whatsapp-agent/send";
import { buildSecurityMessage } from "@/lib/message-templates";
import { getBaseUrl } from "@/lib/base-url";
import { signerConditionsFiche } from "@/lib/contrat-donnees";
import { tracer } from "@/lib/journal";
import { ficheTerminee } from "@/lib/fiche-police-progression";
import type { OccupantInput } from "@/lib/actions/gendarmerie";

// Fiche police « voyageur par voyageur » — Fouad, 2026-10-31 : « quand on envoie le lien pour que
// le client scanne son passeport, ils ont du mal à comprendre. Il faut tous les passeports de tout
// le monde, et des fois ils ne sont pas ensemble quelques jours avant. Lui s'enregistre tout seul,
// il envoie le lien aux autres, eux s'enregistrent, et ça sauvegarde : le passeport 1 reste
// enregistré jusqu'à ce que tout soit fait. Une fois que c'est fait, pour nous ça devient vert. »
//
// Avant (submitGendarmerieOccupants) : un seul envoi pour tout le groupe, rien de sauvegardé
// avant, et le premier « Envoyer » passait la fiche en « complete » même avec un seul passeport.
// Ici chaque adulte est enregistré dès qu'il valide sa propre carte ; la fiche ne passe en
// « complete » que quand le nombre d'adultes attendus est atteint (nbAdultesPrevu, que le
// voyageur principal peut corriger, sinon le nombre d'adultes de la réservation).
//
// Volontairement sans auth.protect() : le voyageur passe par le lien public /g/[id].

export type EtatFiche = {
  statut: "en_attente" | "complete" | "attente_signature";
  recus: number;
  attendus: number | null;
  // Prénoms déjà enregistrés (jamais de données de pièce d'identité côté public).
  prenoms: string[];
  enfantsPhotos: number;
  // Nombre d'enfants annoncé (fiche, sinon réservation) ; null tant qu'il n'est pas connu.
  enfantsAttendus: number | null;
};

async function etatFiche(formId: string): Promise<EtatFiche> {
  const db = getDb();
  const [form] = await db
    .select({
      statut: gendarmerieForms.statut,
      nbAdultesPrevu: gendarmerieForms.nbAdultesPrevu,
      nbEnfantsPrevu: gendarmerieForms.nbEnfantsPrevu,
      enfantsPassportUrls: gendarmerieForms.enfantsPassportUrls,
      nbAdultesResa: reservations.nbAdultes,
      nbEnfantsResa: reservations.nbEnfants,
    })
    .from(gendarmerieForms)
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .where(eq(gendarmerieForms.id, formId))
    .limit(1);
  if (!form) throw new Error("Formulaire introuvable.");
  const occupants = await db
    .select({ prenom: gendarmerieOccupants.prenom, nom: gendarmerieOccupants.nom })
    .from(gendarmerieOccupants)
    .where(eq(gendarmerieOccupants.formId, formId))
    .orderBy(asc(gendarmerieOccupants.createdAt));
  const attendusBrut = form.nbAdultesPrevu ?? form.nbAdultesResa ?? null;
  return {
    statut: form.statut === "complete" ? "complete" : form.statut === "attente_signature" ? "attente_signature" : "en_attente",
    recus: occupants.length,
    attendus: attendusBrut && attendusBrut > 0 ? attendusBrut : null,
    prenoms: occupants.map((o) => (o.prenom?.trim() || o.nom?.trim() || "?").split(" ")[0]),
    enfantsPhotos: (form.enfantsPassportUrls ?? []).length,
    enfantsAttendus: form.nbEnfantsPrevu ?? form.nbEnfantsResa ?? null,
  };
}

export async function chargerEtatFichePublic(formId: string): Promise<EtatFiche> {
  return etatFiche(formId);
}

async function notifierSecurite(reservationId: string | null) {
  if (!reservationId) return;
  try {
    const db = getDb();
    const [reservation] = await db
      .select({
        villaId: reservations.villaId,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        securiteNotifieeAt: reservations.securiteNotifieeAt,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!reservation || reservation.securiteNotifieeAt || !reservation.villaId) return;
    const [villa] = await db
      .select({ nom: villas.nom, numero: villas.numero, securitePhone: domaines.securitePhone })
      .from(villas)
      .leftJoin(domaines, eq(domaines.id, villas.domaineId))
      .where(eq(villas.id, reservation.villaId))
      .limit(1);
    if (!villa?.securitePhone) return;
    const link = `${getBaseUrl()}/securite/villa/${reservationId}`;
    const message = buildSecurityMessage(reservation.guestName, villa.nom, villa.numero, link, reservation.checkIn);
    const sent = await sendWhatsAppText(villa.securitePhone, message);
    if (sent) {
      await db.update(reservations).set({ securiteNotifieeAt: new Date() }).where(eq(reservations.id, reservationId));
    }
  } catch (err) {
    console.error("Échec notification sécurité (fiche police):", err);
  }
}

// Passe la fiche en « complete » si tous les adultes attendus sont enregistrés (ou si le nombre
// attendu est inconnu et qu'au moins un adulte l'est : fiche libre sans réservation). Renvoie
// l'état à jour. Idempotent : une fiche déjà complète le reste.
async function verifierCompletion(formId: string, langue: string | null): Promise<EtatFiche> {
  const db = getDb();
  const etat = await etatFiche(formId);
  const terminee = ficheTerminee(etat.recus, etat.attendus);
  if (etat.statut === "complete" || !terminee) return etat;

  const [form] = await db
    .select({ villaId: gendarmerieForms.villaId, reservationId: gendarmerieForms.reservationId })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.id, formId))
    .limit(1);
  await db
    .update(gendarmerieForms)
    .set({ statut: "complete", completedAt: new Date(), ...(langue ? { langue } : {}) })
    .where(eq(gendarmerieForms.id, formId));

  if (form) {
    await notifierSecurite(form.reservationId);
    let villaNom: string | null = null;
    if (form.villaId) {
      const [v] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, form.villaId)).limit(1);
      villaNom = v?.nom ?? null;
    }
    await tracer({
      categorie: "gendarmerie",
      action: "fiche_police_remplie",
      libelle: `Fiche police complète (${etat.recus} adulte${etat.recus > 1 ? "s" : ""})`,
      resume: villaNom,
      villaId: form.villaId,
      villaNom,
      reservationId: form.reservationId,
      auteur: { type: "humain" as const, id: null, nom: "Voyageur (lien)", email: null },
    });
  }
  revalidatePath("/villas");
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  revalidatePath(`/g/${formId}`);
  return { ...etat, statut: "complete" };
}

// Enregistre UN adulte (sa carte : identité, photo de la pièce, signature) et, pour le premier qui
// s'enregistre, les conditions de séjour acceptées (= contrat signé, comme avant). Renvoie l'état
// de la fiche (reçus / attendus) pour que la page affiche ce qu'il manque.
export async function enregistrerOccupantPublic(
  formId: string,
  langue: string,
  occupant: OccupantInput,
  options: { accepteConditions?: boolean; nbAdultesAttendus?: number | null; nbEnfantsAttendus?: number | null } = {}
): Promise<EtatFiche> {
  const db = getDb();
  const [form] = await db.select().from(gendarmerieForms).where(eq(gendarmerieForms.id, formId)).limit(1);
  if (!form) throw new Error("Formulaire introuvable.");
  if (form.statut === "attente_signature") throw new Error("Cette fiche attend seulement une signature.");
  if (!occupant.nom.trim() && !occupant.prenom.trim()) throw new Error("Nom ou prénom manquant.");

  const photoPieceUrl = occupant.photoPieceUrl ? await normalizeIdPhotoDataUrl(occupant.photoPieceUrl) : "";

  await db.insert(gendarmerieOccupants).values({
    formId,
    nom: occupant.nom.trim() || null,
    prenom: occupant.prenom.trim() || null,
    dateNaissance: occupant.dateNaissance.trim() || null,
    lieuNaissance: occupant.lieuNaissance.trim() || null,
    nationalite: occupant.nationalite.trim() || null,
    profession: occupant.profession.trim() || null,
    venantDe: occupant.venantDe.trim() || null,
    allantA: occupant.allantA.trim() || null,
    dateArrivee: occupant.dateArrivee.trim() || null,
    domicileHabituel: occupant.domicileHabituel.trim() || null,
    typePiece: occupant.typePiece.trim() || null,
    numeroPiece: occupant.numeroPiece.trim() || null,
    datePiece: occupant.datePiece.trim() || null,
    lieuPiece: occupant.lieuPiece.trim() || null,
    signatureNom: occupant.signatureNom.trim() || null,
    signatureImage: occupant.signatureImage || null,
    photoPieceUrl: photoPieceUrl || null,
  });

  const majFiche: Partial<typeof gendarmerieForms.$inferInsert> = { langue };
  if (options.nbAdultesAttendus && options.nbAdultesAttendus > 0) majFiche.nbAdultesPrevu = options.nbAdultesAttendus;
  // 0 est une réponse valable (« pas d'enfants »), donc on teste null et non la valeur.
  if (options.nbEnfantsAttendus != null && options.nbEnfantsAttendus >= 0) {
    majFiche.nbEnfantsPrevu = Math.min(Math.floor(options.nbEnfantsAttendus), 20);
  }
  await db.update(gendarmerieForms).set(majFiche).where(eq(gendarmerieForms.id, formId));

  // Conditions de séjour : acceptées par le premier qui s'enregistre (le voyageur principal), sans
  // attendre les autres. signerConditionsFiche ne fait rien si un contrat signé existe déjà.
  if (options.accepteConditions && occupant.signatureImage) {
    try {
      await signerConditionsFiche(formId, {
        nom: occupant.signatureNom.trim() || [occupant.prenom.trim(), occupant.nom.trim()].filter(Boolean).join(" "),
        piece: occupant.numeroPiece,
        signatureImage: occupant.signatureImage,
      });
    } catch (err) {
      console.error("Échec enregistrement des conditions de séjour (fiche police progressive):", err);
    }
  }

  const etat = await verifierCompletion(formId, langue);
  revalidatePath("/dashboard");
  revalidatePath(`/g/${formId}`);
  return etat;
}

// Photos des passeports des enfants (pas de fiche pour eux) : ajoutées à tout moment par n'importe
// quel membre du groupe.
export async function ajouterPhotosEnfantsPublic(formId: string, dataUrls: string[]): Promise<EtatFiche> {
  const db = getDb();
  const urls = await Promise.all(dataUrls.filter(Boolean).map((u) => normalizeIdPhotoDataUrl(u)));
  if (urls.length > 0) {
    await db
      .update(gendarmerieForms)
      .set({
        enfantsPassportUrls: sql`coalesce(${gendarmerieForms.enfantsPassportUrls}, '[]'::jsonb) || ${JSON.stringify(urls)}::jsonb`,
      })
      .where(eq(gendarmerieForms.id, formId));
  }
  revalidatePath(`/g/${formId}`);
  return etatFiche(formId);
}

// Le voyageur principal corrige le nombre d'adultes du groupe (« nous sommes finalement 3 ») : la
// fiche devient complète dès que ce nombre est atteint.
export async function fixerNombreAdultesPublic(formId: string, nbAdultes: number): Promise<EtatFiche> {
  const db = getDb();
  const n = Math.max(1, Math.min(30, Math.floor(nbAdultes)));
  const [form] = await db.select({ langue: gendarmerieForms.langue }).from(gendarmerieForms).where(eq(gendarmerieForms.id, formId)).limit(1);
  if (!form) throw new Error("Formulaire introuvable.");
  const avant = await etatFiche(formId);
  // « Une personne de plus » après coup : la fiche redevient en attente (et repasse en orange pour
  // l'agence) jusqu'à l'enregistrement du passeport manquant.
  const rouvrir = avant.statut === "complete" && n > avant.recus;
  await db
    .update(gendarmerieForms)
    .set({ nbAdultesPrevu: n, ...(rouvrir ? { statut: "en_attente", completedAt: null } : {}) })
    .where(eq(gendarmerieForms.id, formId));
  const etat = await verifierCompletion(formId, form.langue);
  revalidatePath("/dashboard");
  revalidatePath(`/g/${formId}`);
  return etat;
}
