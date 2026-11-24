import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { villaNotes } from "@/db/schema-notes";
import { categorieNoteValide, libelleCategorieNote } from "@/lib/notes-villa";
import type { UtilisateurTelegram } from "@/lib/telegram-agent/utilisateurs";

async function trouverVilla(nom: string | undefined) {
  if (!nom) return null;
  const rows = await getDb().select({ id: villas.id, nom: villas.nom }).from(villas);
  return rows.find((v) => v.nom.toLowerCase() === nom.trim().toLowerCase()) ?? null;
}

// Outil add_villa_note : une note classée par catégorie, rattachée à un logement (ou générale).
export async function ajouterNoteVilla(input: Record<string, unknown>, utilisateur: UtilisateurTelegram, vocal: boolean) {
  const texte = String(input.texte ?? "").trim();
  if (!texte) return { ok: false, erreur: "Note vide." };
  const villaNom = input.villaNom ? String(input.villaNom) : undefined;
  const villa = await trouverVilla(villaNom);
  if (villaNom && !villa) return { ok: false, erreur: `Villa introuvable : ${villaNom}. Demande laquelle.` };
  const montant = typeof input.montant === "number" && Number.isFinite(input.montant) ? input.montant : null;
  const categorie = categorieNoteValide(input.categorie);
  await getDb()
    .insert(villaNotes)
    .values({
      villaId: villa?.id ?? null,
      categorie,
      texte: texte.slice(0, 2000),
      montant: montant != null ? montant.toFixed(2) : null,
      devise: montant != null ? String(input.devise ?? "MAD").toUpperCase().slice(0, 3) : null,
      auteurNom: utilisateur.nom,
      auteurId: utilisateur.auteurId,
      source: "telegram",
      vocal,
    });
  return { ok: true, villa: villa?.nom ?? "Général (sans logement)", categorie: libelleCategorieNote(categorie) };
}

// Outil get_villa_notes : relit les notes d'un logement (et/ou d'une catégorie) sur N jours.
export async function lireNotesVilla(input: Record<string, unknown>) {
  const villaNom = input.villaNom ? String(input.villaNom) : undefined;
  const villa = await trouverVilla(villaNom);
  if (villaNom && !villa) return { ok: false, erreur: `Villa introuvable : ${villaNom}.` };
  const jours = Math.min(Math.max(Number(input.jours) || 14, 1), 90);
  const conds = [gte(villaNotes.createdAt, new Date(Date.now() - jours * 86_400_000))];
  if (villa) conds.push(eq(villaNotes.villaId, villa.id));
  if (input.categorie) conds.push(eq(villaNotes.categorie, categorieNoteValide(input.categorie)));
  if (input.nonResolues === true) conds.push(eq(villaNotes.resolu, false));
  const rows = await getDb()
    .select({
      texte: villaNotes.texte,
      categorie: villaNotes.categorie,
      montant: villaNotes.montant,
      devise: villaNotes.devise,
      auteur: villaNotes.auteurNom,
      resolu: villaNotes.resolu,
      at: villaNotes.createdAt,
      villa: villas.nom,
    })
    .from(villaNotes)
    .leftJoin(villas, eq(villaNotes.villaId, villas.id))
    .where(and(...conds))
    .orderBy(desc(villaNotes.createdAt))
    .limit(30);
  return {
    ok: true,
    notes: rows.map((r) => ({
      villa: r.villa ?? "Général",
      categorie: libelleCategorieNote(r.categorie),
      texte: r.texte,
      montant: r.montant ? `${r.montant} ${r.devise ?? ""}`.trim() : null,
      par: r.auteur,
      resolu: r.resolu,
      date: r.at.toISOString().slice(0, 16).replace("T", " "),
    })),
  };
}
