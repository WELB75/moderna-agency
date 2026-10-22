import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { reservations, villas, domaines, gendarmerieForms } from "@/db/schema";
import { syndicLogements } from "@/db/schema-syndic";
import { getReservationSecurityData } from "@/lib/security-data";
import { numeroAffichable } from "@/lib/logement-format";
import { nowInMorocco } from "@/lib/now";

// « Déclaration sur l'honneur » remise au syndic / à la sécurité de la résidence pour chaque
// séjour dans un appartement (Noria). Jusqu'ici Imane recopiait à la main, dans un Word, les
// noms et numéros de pièce de chaque voyageur, l'appartement, l'immeuble et les dates — autant
// d'informations que l'app possède déjà (fiche police + réservation). Le document est maintenant
// généré depuis la réservation ; il ne reste à saisir, une fois par appartement, que l'en-tête
// du syndic (voir syndicLogements).

// Copropriétaire déclarant : le même pour tous les appartements (2026-10-22, « oui, toujours Imad
// Jaiel »). Le lieu de délivrance n'est pas connu : laissé en pointillés comme sur le modèle.
export const DECLARANT_SYNDIC = {
  nom: "Imad Jaiel",
  piece: "PN828574",
  delivreA: "",
} as const;

let tablePrete: Promise<void> | null = null;

export function assurerTableSyndic(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS syndic_logements (
          villa_id uuid PRIMARY KEY,
          entete text NOT NULL,
          residence text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`ALTER TABLE syndic_logements ADD COLUMN IF NOT EXISTS whatsapp text`);
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

export type SyndicLogement = { entete: string; residence: string; whatsapp: string | null };

export async function getSyndicLogement(villaId: string): Promise<SyndicLogement | null> {
  await assurerTableSyndic();
  const db = getDb();
  const [row] = await db
    .select({ entete: syndicLogements.entete, residence: syndicLogements.residence, whatsapp: syndicLogements.whatsapp })
    .from(syndicLogements)
    .where(eq(syndicLogements.villaId, villaId))
    .limit(1);
  return row ?? null;
}

export type DeclarationPersonne = {
  id: string;
  nom: string;
  piece: string;
  enfant: boolean;
};

export type DeclarationSyndic = {
  reservationId: string;
  villaId: string;
  villaNom: string;
  villaType: "villa" | "appartement";
  numeroAppartement: string | null;
  numeroImmeuble: string | null;
  domaineNom: string | null;
  guestName: string;
  du: string; // jj/mm/aaaa
  au: string;
  faitLe: string; // jj/mm/aaaa (aujourd'hui)
  personnes: DeclarationPersonne[];
  nbAdultesAttendus: number | null;
  nbEnfantsAttendus: number;
  // null : aucune fiche police remplie pour ce séjour — le document ne peut pas être produit.
  fichePoliceComplete: boolean;
  syndic: SyndicLogement | null;
};

// Toutes les données de la déclaration pour une réservation. Les adultes viennent de la fiche
// police du séjour (nom, prénom, numéro de pièce) ; les enfants, dont on ne collecte que la photo
// du passeport, sont ajoutés comme lignes « enfant » sans numéro pour que la sécurité voie bien
// tout le monde.
export async function getDeclarationSyndic(reservationId: string): Promise<DeclarationSyndic | null> {
  const db = getDb();
  const [r] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      villaId: villas.id,
      villaNom: villas.nom,
      villaType: villas.type,
      villaNumero: villas.numero,
      numeroImmeuble: villas.numeroImmeuble,
      domaineNom: domaines.nom,
    })
    .from(reservations)
    .innerJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return null;

  const [securite, syndic] = await Promise.all([getReservationSecurityData(r.id), getSyndicLogement(r.villaId)]);
  const occupants = securite?.occupants ?? [];
  const adultes = occupants.filter((o) => !o.estEnfant);
  const enfants = occupants.filter((o) => o.estEnfant);

  const personnes: DeclarationPersonne[] = [
    ...adultes.map((o) => ({
      id: o.id,
      nom: [o.nom, o.prenom].filter(Boolean).join(" ").trim(),
      piece: (o.numeroPiece ?? "").trim(),
      enfant: false,
    })),
    ...enfants.map((o, i) => ({
      id: o.id,
      nom: `Enfant mineur accompagnant ${enfants.length > 1 ? i + 1 : ""}`.trim(),
      piece: "",
      enfant: true,
    })),
  ];

  const jour = (d: Date) => format(d, "dd/MM/yyyy");
  return {
    reservationId: r.id,
    villaId: r.villaId,
    villaNom: r.villaNom,
    villaType: r.villaType,
    numeroAppartement: numeroAffichable(r.villaNumero),
    numeroImmeuble: numeroAffichable(r.numeroImmeuble),
    domaineNom: r.domaineNom,
    guestName: r.guestName,
    du: jour(new Date(r.checkIn)),
    au: jour(new Date(r.checkOut)),
    faitLe: jour(nowInMorocco()),
    personnes,
    nbAdultesAttendus: r.nbAdultes,
    nbEnfantsAttendus: r.nbEnfants ?? 0,
    fichePoliceComplete: adultes.length > 0,
    syndic,
  };
}

// Contrat (conditions de séjour) lié à ce séjour : la fiche police le référence, un contrat n'ayant
// pas de colonne reservationId (voir contrat-donnees.ts).
export async function getContratIdDuSejour(reservationId: string): Promise<string | null> {
  const [f] = await getDb()
    .select({ contratId: gendarmerieForms.contratId })
    .from(gendarmerieForms)
    .where(and(eq(gendarmerieForms.reservationId, reservationId), isNotNull(gendarmerieForms.contratId)))
    .orderBy(desc(gendarmerieForms.createdAt))
    .limit(1);
  return f?.contratId ?? null;
}
