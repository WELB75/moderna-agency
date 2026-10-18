"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, villas } from "@/db/schema";
import { AGENCE_REPRESENTANT_DEFAUT } from "@/lib/contrat-template";
import { derniereSignatureAgence } from "@/lib/contrat-donnees";
import { tracer } from "@/lib/journal";

export async function generateContrat(input: {
  villaId: string;
  agenceRepresentant: string;
  locataireNom: string;
  locataireAdresse: string;
  nbAdultes: number;
  nbEnfants: number;
  dateArrivee: string;
  dateDepart: string;
  devise: string;
  montantTotal: string;
  acompteMontant: string;
  soldeMontant: string;
  soldeDateLimite: string;
  depotGarantieMontant: string;
  depotRestitutionDate: string;
  lieuSignature: string;
  dateSignatureAgence: string;
  // Vide = reprendre la dernière signature de l'agence déjà enregistrée (plus besoin de la
  // redessiner à chaque contrat).
  signatureAgenceImage: string;
  // Séjour d'origine (pré-remplissage) : sert à rattacher la fiche police du dossier.
  reservationId?: string;
}) {
  await auth.protect();
  const user = await currentUser();
  const signatureAgenceImage = input.signatureAgenceImage || (await derniereSignatureAgence());

  const db = getDb();
  const [contrat] = await db
    .insert(contratsLocation)
    .values({
      villaId: input.villaId,
      agenceRepresentant: input.agenceRepresentant.trim() || AGENCE_REPRESENTANT_DEFAUT,
      locataireNom: input.locataireNom.trim() || null,
      locataireAdresse: input.locataireAdresse.trim() || null,
      nbAdultes: Math.max(1, Math.round(input.nbAdultes) || 1),
      nbEnfants: Math.max(0, Math.round(input.nbEnfants) || 0),
      dateArrivee: input.dateArrivee.trim() || null,
      dateDepart: input.dateDepart.trim() || null,
      devise: input.devise.trim() || "DH",
      montantTotal: input.montantTotal.trim() || null,
      acompteMontant: input.acompteMontant.trim() || null,
      soldeMontant: input.soldeMontant.trim() || null,
      soldeDateLimite: input.soldeDateLimite.trim() || null,
      depotGarantieMontant: input.depotGarantieMontant.trim() || null,
      depotRestitutionDate: input.depotRestitutionDate.trim() || null,
      lieuSignature: input.lieuSignature.trim() || "Marrakech",
      dateSignatureAgence: input.dateSignatureAgence.trim() || null,
      signatureAgenceNom: input.agenceRepresentant.trim() || AGENCE_REPRESENTANT_DEFAUT,
      signatureAgenceImage: signatureAgenceImage || null,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, input.villaId)).limit(1);
  await tracer({
    categorie: "contrat",
    action: "contrat_genere",
    libelle: "Contrat de location généré",
    resume: `${input.locataireNom.trim() || "Locataire non renseigné"} · du ${input.dateArrivee || "?"} au ${input.dateDepart || "?"}${input.montantTotal.trim() ? ` · ${input.montantTotal.trim()} ${input.devise.trim() || "DH"}` : ""}`,
    villaId: input.villaId,
    villaNom: villa?.nom ?? null,
    reservationId: input.reservationId || null,
  });

  revalidatePath("/documents");
  return contrat;
}

// Génère les Conditions de séjour ET la fiche police dans un seul lien (/dossier/[id]) : le client
// remplit la fiche de police (tout le groupe sur la même page), puis signe les conditions.
// Rattaché à un séjour, on réutilise sa fiche police existante (celle créée par la synchro Beds24,
// dont le lien /g/[id] redirige alors vers ce dossier) au lieu d'en créer une seconde ; si elle est
// déjà remplie, il ne reste que les conditions à signer (lien /c/[id]).
export async function generateDossier(
  input: Parameters<typeof generateContrat>[0]
): Promise<{ contratId: string; lien: string }> {
  await auth.protect();
  const user = await currentUser();

  const contrat = await generateContrat(input);
  const db = getDb();
  const nbAdultes = Math.min(Math.max(Math.round(input.nbAdultes) || 1, 1), 20);
  const nbEnfants = Math.min(Math.max(Math.round(input.nbEnfants) || 0, 0), 20);

  if (input.reservationId) {
    const fiches = await db
      .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut, contratId: gendarmerieForms.contratId })
      .from(gendarmerieForms)
      .where(eq(gendarmerieForms.reservationId, input.reservationId))
      .orderBy(asc(gendarmerieForms.createdAt));

    if (fiches.some((f) => f.statut === "complete")) {
      revalidatePath("/documents");
      return { contratId: contrat.id, lien: `/c/${contrat.id}` };
    }
    const libre = fiches.find((f) => !f.contratId && f.statut === "en_attente");
    if (libre) {
      await db.update(gendarmerieForms).set({ contratId: contrat.id }).where(eq(gendarmerieForms.id, libre.id));
      revalidatePath("/documents");
      return { contratId: contrat.id, lien: `/dossier/${contrat.id}` };
    }
  }

  await db.insert(gendarmerieForms).values({
    villaId: input.villaId,
    reservationId: input.reservationId || null,
    contratId: contrat.id,
    nbAdultesPrevu: nbAdultes,
    nbEnfantsPrevu: nbEnfants,
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/documents");
  return { contratId: contrat.id, lien: `/dossier/${contrat.id}` };
}

// Volontairement sans auth.protect() : le client signe via le lien public /c/[id], sans se connecter.
export async function submitContratSignature(
  contratId: string,
  data: { clientNom: string; clientPiece: string; signatureImage: string }
) {
  if (!data.signatureImage) throw new Error("La signature est obligatoire.");

  const db = getDb();
  const [contrat] = await db
    .select()
    .from(contratsLocation)
    .where(eq(contratsLocation.id, contratId))
    .limit(1);
  if (!contrat) throw new Error("Contrat introuvable.");
  if (contrat.statut === "signe") throw new Error("Ce contrat a déjà été signé.");

  await db
    .update(contratsLocation)
    .set({
      statut: "signe",
      signatureClientNom: data.clientNom.trim() || null,
      signatureClientPiece: data.clientPiece.trim() || null,
      signatureClientImage: data.signatureImage,
      signedAt: new Date(),
    })
    .where(eq(contratsLocation.id, contratId));

  const nomClient = data.clientNom.trim() || contrat.locataireNom || "Client";
  const [villa] = contrat.villaId ? await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, contrat.villaId)).limit(1) : [];
  await tracer({
    categorie: "contrat",
    action: "contrat_signe",
    libelle: "Contrat signé par le client",
    resume: `${nomClient} · du ${contrat.dateArrivee ?? "?"} au ${contrat.dateDepart ?? "?"}`,
    villaId: contrat.villaId,
    villaNom: villa?.nom ?? null,
    // Signature via lien public : pas de compte Clerk.
    auteur: { type: "humain", id: null, nom: `${nomClient} (client, lien de signature)`, email: null },
  });

  revalidatePath("/documents");
  revalidatePath(`/c/${contratId}`);
}

export async function deleteContrat(contratId: string) {
  await auth.protect();
  const db = getDb();
  const [contrat] = await db
    .select({ locataireNom: contratsLocation.locataireNom, dateArrivee: contratsLocation.dateArrivee, dateDepart: contratsLocation.dateDepart, villaId: contratsLocation.villaId, villaNom: villas.nom })
    .from(contratsLocation)
    .leftJoin(villas, eq(villas.id, contratsLocation.villaId))
    .where(eq(contratsLocation.id, contratId))
    .limit(1);
  // La clé étrangère gendarmerieForms.contratId supprime en cascade : on détache d'abord les fiches
  // police déjà remplies du dossier, pour ne jamais perdre les identités/pièces des voyageurs en
  // supprimant un contrat.
  await db
    .update(gendarmerieForms)
    .set({ contratId: null })
    .where(and(eq(gendarmerieForms.contratId, contratId), eq(gendarmerieForms.statut, "complete")));
  await db.delete(contratsLocation).where(eq(contratsLocation.id, contratId));
  await tracer({
    categorie: "contrat",
    action: "contrat_supprime",
    libelle: "Contrat supprimé",
    resume: contrat ? `${contrat.locataireNom ?? "Locataire non renseigné"} · du ${contrat.dateArrivee ?? "?"} au ${contrat.dateDepart ?? "?"}` : null,
    villaId: contrat?.villaId ?? null,
    villaNom: contrat?.villaNom ?? null,
  });
  revalidatePath("/documents");
}
