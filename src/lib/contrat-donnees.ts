// Données des Conditions de séjour (voir lib/conditions-sejour.ts), lues en base — côté serveur
// uniquement (pages et Server Actions).
//
// Un contrat n'a pas de colonne reservationId : comme partout ailleurs dans l'app (dashboard,
// fiche réservation), il est rattaché à son séjour par logement + date d'arrivée.

import { and, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { contratsLocation, domaines, gendarmerieForms, reservations, villas } from "@/db/schema";
import { AGENCE_NOM } from "@/lib/contrat-template";
import { sejourSansVoyageur, type ConditionsSejourData } from "@/lib/conditions-sejour";

export const AUTEUR_CONDITIONS_AUTO = "Fiche police (automatique)";

function estUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(value.trim());
}

// Jamais vide : adresse du logement si elle est renseignée (et n'est pas un simple lien Maps),
// sinon le domaine, et toujours la ville.
export function adresseLogement(v: {
  adresse: string | null;
  domaineNom: string | null;
  domaineAdresse: string | null;
}): string {
  const adresse = v.adresse?.trim();
  const parts =
    adresse && !estUrl(adresse)
      ? [adresse]
      : [v.domaineNom?.trim(), v.domaineAdresse?.trim() && !estUrl(v.domaineAdresse) ? v.domaineAdresse.trim() : null].filter(
          (p): p is string => Boolean(p)
        );
  if (!parts.some((p) => p.toLowerCase().includes("marrakech"))) parts.push("Marrakech");
  return parts.join(", ");
}

export function libelleLogement(nom: string | null, numero: string | null): string {
  if (!nom) return "le logement";
  return numero ? `${nom} (n°${numero})` : nom;
}

function jour(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Dernière signature de l'agence enregistrée : réutilisée pour ne plus la redessiner à chaque
// contrat (Fouad, 2026-10-18).
export async function derniereSignatureAgence(): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ image: contratsLocation.signatureAgenceImage })
    .from(contratsLocation)
    .where(isNotNull(contratsLocation.signatureAgenceImage))
    .orderBy(desc(contratsLocation.createdAt))
    .limit(1);
  return row?.image ?? null;
}

async function contratSigneExiste(villaId: string, dateArrivee: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: contratsLocation.id })
    .from(contratsLocation)
    .where(
      and(
        eq(contratsLocation.villaId, villaId),
        eq(contratsLocation.dateArrivee, dateArrivee),
        eq(contratsLocation.statut, "signe")
      )
    )
    .limit(1);
  return Boolean(row);
}

// Conditions à faire accepter à la fin de la fiche police /g/[id], ou null quand il n'y en a
// pas : fiche d'un dossier (le contrat y est une étape à part), Bulletin Individuel généré seul
// (un lien par adulte, sans séjour), blocage, ou conditions déjà signées pour ce séjour.
export async function chargerConditionsFiche(formId: string): Promise<ConditionsSejourData | null> {
  const db = getDb();
  const [f] = await db
    .select({
      reservationId: gendarmerieForms.reservationId,
      villaId: gendarmerieForms.villaId,
      contratId: gendarmerieForms.contratId,
      nbAdultesPrevu: gendarmerieForms.nbAdultesPrevu,
      nbEnfantsPrevu: gendarmerieForms.nbEnfantsPrevu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaAdresse: villas.adresse,
      domaineNom: domaines.nom,
      domaineAdresse: domaines.adresse,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(gendarmerieForms.id, formId))
    .limit(1);

  if (!f || f.contratId || !f.villaId || !f.villaNom) return null;
  if (!f.reservationId && f.nbAdultesPrevu == null) return null;

  let resa: {
    guestName: string;
    checkIn: Date;
    checkOut: Date;
    nbAdultes: number | null;
    nbEnfants: number | null;
    canal: string | null;
    status: string;
    caution: string | null;
    devisePaiement: string;
  } | null = null;

  if (f.reservationId) {
    [resa] = await db
      .select({
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        nbAdultes: reservations.nbAdultes,
        nbEnfants: reservations.nbEnfants,
        canal: reservations.canal,
        status: reservations.status,
        caution: reservations.caution,
        devisePaiement: reservations.devisePaiement,
      })
      .from(reservations)
      .where(eq(reservations.id, f.reservationId))
      .limit(1);
    if (!resa || resa.status === "annulee" || sejourSansVoyageur(resa)) return null;
    if (await contratSigneExiste(f.villaId, jour(resa.checkIn))) return null;
  }

  return {
    locataireNom: resa?.guestName ?? null,
    logement: libelleLogement(f.villaNom, f.villaNumero),
    adresse: adresseLogement({ adresse: f.villaAdresse, domaineNom: f.domaineNom, domaineAdresse: f.domaineAdresse }),
    dateArrivee: resa ? jour(resa.checkIn) : null,
    dateDepart: resa ? jour(resa.checkOut) : null,
    nbAdultes: resa?.nbAdultes ?? f.nbAdultesPrevu ?? null,
    nbEnfants: resa?.nbEnfants ?? f.nbEnfantsPrevu ?? null,
    canal: resa?.canal ?? null,
    // Montants jamais repris automatiquement : pour une résa plateforme ce sont ceux de la
    // plateforme, et pour une résa directe ils n'ont pas été relus par l'équipe (un contrat avec
    // montants se génère depuis Documents).
    devise: resa?.devisePaiement ?? "EUR",
    montantTotal: null,
    acompteMontant: null,
    soldeMontant: null,
    soldeDateLimite: null,
    cautionMontant: resa?.caution ?? null,
    cautionDevise: resa?.devisePaiement ?? "EUR",
  };
}

// Enregistre les conditions acceptées à la fin de la fiche police comme un contrat signé —
// visible dans Documents et sur la fiche réservation ("Contrat · Signé"), imprimable comme les
// autres. Volontairement SANS gendarmerieForms.contratId : la clé étrangère supprime la fiche
// police en cascade si le contrat est supprimé.
export async function signerConditionsFiche(
  formId: string,
  signataire: { nom: string; piece: string; signatureImage: string }
): Promise<void> {
  if (!signataire.signatureImage) return;
  const data = await chargerConditionsFiche(formId);
  if (!data) return;

  const db = getDb();
  const [f] = await db
    .select({ villaId: gendarmerieForms.villaId })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.id, formId))
    .limit(1);
  if (!f?.villaId) return;

  await db.insert(contratsLocation).values({
    villaId: f.villaId,
    agenceRepresentant: AGENCE_NOM,
    locataireNom: data.locataireNom || signataire.nom.trim() || null,
    nbAdultes: Math.max(1, data.nbAdultes ?? 1),
    nbEnfants: Math.max(0, data.nbEnfants ?? 0),
    dateArrivee: data.dateArrivee,
    dateDepart: data.dateDepart,
    devise: data.devise,
    depotGarantieMontant: data.cautionMontant,
    lieuSignature: "Marrakech",
    dateSignatureAgence: format(new Date(), "dd/MM/yyyy"),
    signatureAgenceNom: AGENCE_NOM,
    signatureAgenceImage: await derniereSignatureAgence(),
    statut: "signe",
    signatureClientNom: signataire.nom.trim() || null,
    signatureClientPiece: signataire.piece.trim() || null,
    signatureClientImage: signataire.signatureImage,
    signedAt: new Date(),
    createdByName: AUTEUR_CONDITIONS_AUTO,
  });
}

export type ContratCharge = {
  id: string;
  statut: string;
  villaId: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaAdresse: string | null;
  agenceRepresentant: string;
  locataireNom: string | null;
  locataireAdresse: string | null;
  nbAdultes: number;
  nbEnfants: number;
  dateArrivee: string | null;
  dateDepart: string | null;
  devise: string;
  montantTotal: string | null;
  acompteMontant: string | null;
  soldeMontant: string | null;
  soldeDateLimite: string | null;
  depotGarantieMontant: string | null;
  depotRestitutionDate: string | null;
  lieuSignature: string;
  dateSignatureAgence: string | null;
  signatureAgenceNom: string | null;
  signatureAgenceImage: string | null;
  signatureClientNom: string | null;
  signatureClientPiece: string | null;
  signatureClientImage: string | null;
  signedAt: Date | null;
  createdByName: string | null;
  conditions: ConditionsSejourData;
};

export async function chargerContrat(contratId: string): Promise<ContratCharge | null> {
  const db = getDb();
  const [c] = await db
    .select({
      id: contratsLocation.id,
      statut: contratsLocation.statut,
      villaId: contratsLocation.villaId,
      agenceRepresentant: contratsLocation.agenceRepresentant,
      locataireNom: contratsLocation.locataireNom,
      locataireAdresse: contratsLocation.locataireAdresse,
      nbAdultes: contratsLocation.nbAdultes,
      nbEnfants: contratsLocation.nbEnfants,
      dateArrivee: contratsLocation.dateArrivee,
      dateDepart: contratsLocation.dateDepart,
      devise: contratsLocation.devise,
      montantTotal: contratsLocation.montantTotal,
      acompteMontant: contratsLocation.acompteMontant,
      soldeMontant: contratsLocation.soldeMontant,
      soldeDateLimite: contratsLocation.soldeDateLimite,
      depotGarantieMontant: contratsLocation.depotGarantieMontant,
      depotRestitutionDate: contratsLocation.depotRestitutionDate,
      lieuSignature: contratsLocation.lieuSignature,
      dateSignatureAgence: contratsLocation.dateSignatureAgence,
      signatureAgenceNom: contratsLocation.signatureAgenceNom,
      signatureAgenceImage: contratsLocation.signatureAgenceImage,
      signatureClientNom: contratsLocation.signatureClientNom,
      signatureClientPiece: contratsLocation.signatureClientPiece,
      signatureClientImage: contratsLocation.signatureClientImage,
      signedAt: contratsLocation.signedAt,
      createdByName: contratsLocation.createdByName,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaAdresse: villas.adresse,
      domaineNom: domaines.nom,
      domaineAdresse: domaines.adresse,
    })
    .from(contratsLocation)
    .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(contratsLocation.id, contratId))
    .limit(1);
  if (!c) return null;

  // Séjour correspondant (même logement, même jour d'arrivée) : canal et caution.
  let resa: { canal: string | null; caution: string | null; devisePaiement: string } | null = null;
  const dateMatch = (c.dateArrivee ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (c.villaId && dateMatch) {
    const debut = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
    const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);
    const candidats = await db
      .select({
        guestName: reservations.guestName,
        canal: reservations.canal,
        caution: reservations.caution,
        devisePaiement: reservations.devisePaiement,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.villaId, c.villaId),
          ne(reservations.status, "annulee"),
          gte(reservations.checkIn, debut),
          lt(reservations.checkIn, fin)
        )
      );
    resa = candidats.find((r) => !sejourSansVoyageur(r)) ?? null;
  }

  const { domaineNom, domaineAdresse, ...contrat } = c;
  return {
    ...contrat,
    conditions: {
      locataireNom: c.locataireNom,
      logement: libelleLogement(c.villaNom, c.villaNumero),
      adresse: adresseLogement({ adresse: c.villaAdresse, domaineNom, domaineAdresse }),
      dateArrivee: c.dateArrivee,
      dateDepart: c.dateDepart,
      nbAdultes: c.nbAdultes,
      nbEnfants: c.nbEnfants,
      canal: resa?.canal ?? null,
      devise: c.devise,
      montantTotal: c.montantTotal,
      acompteMontant: c.acompteMontant,
      soldeMontant: c.soldeMontant,
      soldeDateLimite: c.soldeDateLimite,
      cautionMontant: c.depotGarantieMontant || resa?.caution || null,
      cautionDevise: c.depotGarantieMontant ? c.devise : (resa?.devisePaiement ?? "EUR"),
    },
  };
}
