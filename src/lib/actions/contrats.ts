"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms } from "@/db/schema";
import { AGENCE_REPRESENTANT_DEFAUT } from "@/lib/contrat-template";

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
  signatureAgenceImage: string;
}) {
  await auth.protect();
  const user = await currentUser();

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
      signatureAgenceImage: input.signatureAgenceImage || null,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath("/documents");
  return contrat;
}

// Génère un contrat ET une fiche police par adulte, tous rattachés (contratId) pour former
// un seul "dossier" : le client ouvre un lien unique, remplit son identité (une fois par
// adulte) puis signe le contrat dans la foulée, sans repartir de zéro.
export async function generateDossier(
  input: Parameters<typeof generateContrat>[0]
) {
  await auth.protect();
  const user = await currentUser();

  const contrat = await generateContrat(input);

  const db = getDb();
  const count = Math.max(1, Math.round(input.nbAdultes) || 1);
  await db.insert(gendarmerieForms).values(
    Array.from({ length: count }, () => ({
      villaId: input.villaId,
      reservationId: null,
      contratId: contrat.id,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    }))
  );

  revalidatePath("/documents");
  return contrat;
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

  revalidatePath("/documents");
  revalidatePath(`/c/${contratId}`);
}

export async function deleteContrat(contratId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(contratsLocation).where(eq(contratsLocation.id, contratId));
  revalidatePath("/documents");
}
