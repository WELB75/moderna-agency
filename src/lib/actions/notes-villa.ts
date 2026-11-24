"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villaNotes } from "@/db/schema-notes";
import { categorieNoteValide } from "@/lib/notes-villa";

export async function ajouterNote(data: {
  villaId: string | null;
  categorie: string;
  texte: string;
  montant?: number | null;
  devise?: string | null;
}) {
  await auth.protect();
  const user = await currentUser();
  const texte = data.texte.trim();
  if (!texte) throw new Error("La note est vide.");
  const montant = typeof data.montant === "number" && Number.isFinite(data.montant) && data.montant > 0 ? data.montant : null;
  await getDb()
    .insert(villaNotes)
    .values({
      villaId: data.villaId || null,
      categorie: categorieNoteValide(data.categorie),
      texte: texte.slice(0, 2000),
      montant: montant != null ? montant.toFixed(2) : null,
      devise: montant != null ? (data.devise === "EUR" ? "EUR" : "MAD") : null,
      auteurNom: user?.fullName ?? user?.firstName ?? user?.username ?? "Équipe",
      auteurId: user?.id ?? null,
      source: "app",
    });
  revalidatePath("/notes");
}

export async function basculerNoteResolue(id: string, resolu: boolean) {
  await auth.protect();
  await getDb()
    .update(villaNotes)
    .set({ resolu, resoluAt: resolu ? new Date() : null })
    .where(eq(villaNotes.id, id));
  revalidatePath("/notes");
}

export async function supprimerNote(id: string) {
  await auth.protect();
  await getDb().delete(villaNotes).where(eq(villaNotes.id, id));
  revalidatePath("/notes");
}
