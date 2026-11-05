import { differenceInCalendarDays } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries, domaines, personnel, personnelAffectations, reservations, villas } from "@/db/schema";
import { codeDevise, getMadParEur, tarifEnDevise } from "@/lib/devises";
import { VILLAS } from "@/lib/whatsapp-agent/villas";
import { tarifMenageJournalier, TARIF_CUISINE_PETIT_DEJEUNER, TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER } from "@/lib/personnel-tarifs";
import {
  arrondir,
  convertir,
  ventiler,
  type CategorieLigne,
  TARIFS_PAR_DEFAUT,
  type ContexteOptions,
  type CoutSejour,
  type TarifsOptions,
  type LigneFacture,
  type Ventilation,
} from "@/lib/compta-reservation-format";
import { convertirDetailNote, lireDetailNote } from "@/lib/compta-note";
import { calculerRevenusPlateforme, estCanalPlateforme, prixBeds24DeRawData, type RevenusPlateforme } from "@/lib/revenus-plateforme";

// Lignes facturées au client pour une réservation (le "devis détaillé" de la comptable). Table
// créée à la volée, comme acces_equipe et equipiers_tournees : pas de migration à lancer sur Neon.

let tablePrete: Promise<void> | null = null;

export function assurerTableLignes(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS reservation_lignes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
          categorie text NOT NULL DEFAULT 'autre',
          libelle text NOT NULL DEFAULT '',
          quantite numeric(10,2) NOT NULL DEFAULT 1,
          prix_unitaire numeric(10,2) NOT NULL DEFAULT 0,
          ordre integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS reservation_lignes_resa_idx ON reservation_lignes (reservation_id, ordre)`);
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

type LigneBrute = { id: string; reservation_id: string; categorie: string; libelle: string; quantite: string; prix_unitaire: string };

function versLigne(r: LigneBrute): LigneFacture {
  return {
    id: r.id,
    categorie: r.categorie as CategorieLigne,
    libelle: r.libelle,
    quantite: Number(r.quantite),
    prixUnitaire: Number(r.prix_unitaire),
  };
}

export async function lignesDeLaReservation(reservationId: string): Promise<LigneFacture[]> {
  await assurerTableLignes();
  const res = await getDb().execute(sql`
    SELECT id, reservation_id, categorie, libelle, quantite, prix_unitaire
    FROM reservation_lignes WHERE reservation_id = ${reservationId} ORDER BY ordre, created_at
  `);
  return (res.rows as LigneBrute[]).map(versLigne);
}

export async function lignesDesReservations(ids: string[]): Promise<Map<string, LigneFacture[]>> {
  const parResa = new Map<string, LigneFacture[]>();
  if (ids.length === 0) return parResa;
  await assurerTableLignes();
  const res = await getDb().execute(sql`
    SELECT id, reservation_id, categorie, libelle, quantite, prix_unitaire
    FROM reservation_lignes WHERE reservation_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) ORDER BY ordre, created_at
  `);
  for (const r of res.rows as LigneBrute[]) {
    const liste = parResa.get(r.reservation_id) ?? [];
    liste.push(versLigne(r));
    parResa.set(r.reservation_id, liste);
  }
  return parResa;
}

type AffectationCompta = {
  role: "menage" | "cuisine";
  nom: string;
  moment: string;
  faitAt: Date | null;
  nbJours: number | null;
  avecDejeuner: boolean;
};
type DepenseCompta = { id: string; categorie: string | null; montant: string; devise: string; description: string | null };

export function calculerCouts(e: {
  devise: string;
  nuits: number;
  domaineNom: string | null;
  nbChambres: number | null;
  madParEur: number;
  affectations: AffectationCompta[];
  depenses: DepenseCompta[];
}): CoutSejour[] {
  const { devise, nuits, madParEur, affectations, depenses } = e;
  const r = { domaineNom: e.domaineNom, nbChambres: e.nbChambres };
  const couts: CoutSejour[] = [];
  const ligneCaisse = (d: (typeof depenses)[number], categorie: CoutSejour["categorie"], libelle: string): CoutSejour => ({
    cle: `caisse-${d.id}`,
    categorie,
    libelle,
    montant: arrondir(convertir(Number(d.montant), d.devise, devise, madParEur)),
    montantOrigine: Number(d.montant),
    deviseOrigine: d.devise,
    reel: true,
    detail: d.description,
  });

  const depMenage = depenses.filter((d) => d.categorie === "femmes_menage");
  const depCuisine = depenses.filter((d) => d.categorie === "cuisinieres");
  const autres = depenses.filter((d) => d.categorie !== "femmes_menage" && d.categorie !== "cuisinieres");

  if (depMenage.length > 0) {
    for (const d of depMenage) couts.push(ligneCaisse(d, "menage", "Ménage"));
  } else {
    const faits = affectations.filter((a) => a.role === "menage");
    const tarif = tarifMenageJournalier({ domaineNom: r.domaineNom, nbChambres: r.nbChambres });
    for (const a of faits) {
      const jours = a.nbJours ?? 1;
      const mad = jours * tarif;
      couts.push({
        cle: `menage-${a.nom}-${a.moment}`,
        categorie: "menage",
        libelle: `Ménage · ${a.nom}${a.moment === "sejour" ? " (pendant le séjour)" : ""}`,
        montant: arrondir(convertir(mad, "MAD", devise, madParEur)),
        montantOrigine: mad,
        deviseOrigine: "MAD",
        reel: false,
        detail: a.faitAt ? "barème, fait" : "barème, prévu",
      });
    }
  }

  if (depCuisine.length > 0) {
    for (const d of depCuisine) couts.push(ligneCaisse(d, "cuisine", "Cuisine"));
  } else {
    for (const a of affectations.filter((x) => x.role === "cuisine")) {
      const jours = a.nbJours ?? Math.max(1, nuits);
      const mad = jours * (a.avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER);
      couts.push({
        cle: `cuisine-${a.nom}`,
        categorie: "cuisine",
        libelle: `Cuisine · ${a.nom}`,
        montant: arrondir(convertir(mad, "MAD", devise, madParEur)),
        montantOrigine: mad,
        deviseOrigine: "MAD",
        reel: false,
        detail: `${jours} j${a.avecDejeuner ? ", petit-déj + déjeuner" : ", petit-déj"} (barème)`,
      });
    }
  }

  for (const d of autres) couts.push(ligneCaisse(d, "caisse", d.description?.trim() || "Dépense de caisse"));
  return couts;
}

export type ComptaReservation = {
  reservationId: string;
  devise: string;
  nuits: number;
  loyerTotal: number | null;
  montantPaye: number | null;
  fraisMenage: number | null;
  moyenPaiement: string | null;
  notesPaiement: string | null;
  lignes: LigneFacture[];
  // Détail lu dans la note libre de la réservation (lib/compta-note.ts), proposé au pré-remplissage.
  lignesDeNote: LigneFacture[];
  ventilation: Ventilation;
  canal: string | null;
  // Airbnb / Booking.com seulement : nuitées, ménage, frais de service hôte, net (null si autre canal)
  revenus: RevenusPlateforme | null;
  revenusEnAttente: boolean; // canal Airbnb/Booking mais détail pas encore reçu de Beds24
};

// Coûts du séjour, sans double compte : pour le ménage et la cuisine, si la caisse contient déjà
// des dépenses rattachées à cette réservation dans la catégorie, ce sont elles qui font foi
// ("réel") ; sinon on retombe sur le barème de l'agence appliqué aux affectations (200 MAD par
// ménage fait, 100/200 MAD par jour de cuisine, 100/150 MAD à Noria) — "prévu" tant que rien n'est
// sorti de la caisse. Les autres dépenses de caisse liées à la réservation sont ajoutées telles quelles.
export async function chargerComptaReservation(reservationId: string, madParEurFourni?: number): Promise<ComptaReservation | null> {
  const db = getDb();
  const [r] = await db
    .select({
      id: reservations.id,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      fraisMenage: reservations.fraisMenage,
      notes: reservations.notes,
      devise: reservations.devisePaiement,
      moyenPaiement: reservations.moyenPaiement,
      notesPaiement: reservations.notesPaiement,
      canal: reservations.canal,
      rawData: reservations.rawData,
      domaineNom: domaines.nom,
      nbChambres: villas.nbChambres,
      villaId: reservations.villaId,
      villaType: villas.type,
      repasInclus: villas.repasInclusDansLoyer,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return null;

  const devise = r.devise || "EUR";
  const nuits = Math.max(0, differenceInCalendarDays(r.checkOut, r.checkIn));
  const madParEur = madParEurFourni ?? (await getMadParEur());
  const lignes = await lignesDeLaReservation(reservationId);

  const affectations = await db
    .select({
      role: personnel.role,
      nom: personnel.nom,
      moment: personnelAffectations.moment,
      faitAt: personnelAffectations.faitAt,
      nbJours: personnelAffectations.nbJours,
      avecDejeuner: personnelAffectations.avecDejeuner,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
    .where(eq(personnelAffectations.reservationId, reservationId));

  const depenses = await db
    .select({
      id: cashEntries.id,
      categorie: cashEntries.categorie,
      montant: cashEntries.montant,
      devise: cashEntries.devise,
      description: cashEntries.description,
    })
    .from(cashEntries)
    .where(and(eq(cashEntries.reservationId, reservationId), eq(cashEntries.type, "depense")));

  const couts = calculerCouts({ devise, nuits, domaineNom: r.domaineNom, nbChambres: r.nbChambres, madParEur, affectations, depenses });

  const loyerTotal = r.loyerTotal != null ? Number(r.loyerTotal) : null;
  const montantPaye = r.montantPaye != null ? Number(r.montantPaye) : null;

  const plateforme = estCanalPlateforme(r.canal);
  const revenus = plateforme
    ? calculerRevenusPlateforme(
        prixBeds24DeRawData(r.rawData),
        loyerTotal,
        // Ménage non saisi sur la réservation : celui de la fiche du logement (Airbnb le facture
        // toujours au voyageur, Sanaa, 2026-11-04 : « il y a des frais de ménage sur Airbnb »).
        r.fraisMenage != null && Number(r.fraisMenage) > 0
          ? Number(r.fraisMenage)
          : convertir(tarifsOptionsLogement({ villaId: r.villaId, type: r.villaType ?? null, repasInclus: Boolean(r.repasInclus) }).menage ?? 0, "EUR", devise, madParEur),
        r.canal
      )
    : null;

  // Détail lu dans la note libre de la réservation, proposé à l'enregistrement du détail financier.
  const lu = lireDetailNote([r.notes, r.notesPaiement].filter(Boolean).join(" . "), nuits);
  const nc = lu ? convertirDetailNote(lu, loyerTotal, (m, d) => convertir(m, d, devise, madParEur)) : null;
  const lignesDeNote: LigneFacture[] = nc
    ? ([
        { categorie: "sejour", libelle: nuits > 0 ? `Séjour (${nuits} nuit${nuits > 1 ? "s" : ""})` : "Séjour", quantite: 1, prixUnitaire: nc.location },
        { categorie: "menage", libelle: "Frais de ménage de fin de séjour", quantite: 1, prixUnitaire: nc.menage },
        { categorie: "cuisine", libelle: "Service cuisinière", quantite: 1, prixUnitaire: nc.cuisine },
        { categorie: "menage_journalier", libelle: "Ménage pendant le séjour", quantite: 1, prixUnitaire: nc.menageExtra },
        { categorie: "piscine", libelle: "Piscine chauffée (pompe à chaleur)", quantite: 1, prixUnitaire: nc.pompeAChaleur },
      ] as LigneFacture[]).filter((l) => l.prixUnitaire > 0)
    : [];

  return {
    canal: r.canal,
    lignesDeNote,
    revenus,
    revenusEnAttente: plateforme && !revenus,
    reservationId,
    devise,
    nuits,
    loyerTotal,
    montantPaye,
    fraisMenage: r.fraisMenage != null ? Number(r.fraisMenage) : null,
    moyenPaiement: r.moyenPaiement,
    notesPaiement: r.notesPaiement,
    lignes,
    ventilation: ventiler({ devise, loyerTotal, montantPaye, lignes, couts }),
  };
}

// Prix des options d'un logement : le ménage de fin de séjour vient de la fiche tarifaire des
// logements (60 € ou 80 € selon la villa, 20 € en appartement, voir whatsapp-agent/villas.ts). La
// cuisinière et la piscine chauffée ne se facturent que sur les villas ; la cuisinière n'est pas
// proposée quand les repas sont déjà compris dans le loyer. Logement absent de la fiche : tarif
// selon son type.
// Villas où la femme de ménage est comprise dans le loyer (Kamel, 2026-11-03 : « la cuisinière n'est
// pas incluse dans la Villa Sofya, c'est la femme de ménage qui l'est »).
const VILLAS_MENAGE_INCLUS = ["bf33c8ba-2f65-4a09-bedd-870646fcdd08"]; // Villa Sofya

export function tarifsOptionsLogement(l: { villaId: string | null; type: "villa" | "appartement" | null; repasInclus: boolean }): TarifsOptions {
  const connu = l.villaId ? VILLAS.find((v) => v.id === l.villaId) : undefined;
  const type = connu?.type ?? l.type ?? "villa";
  if (type === "appartement") {
    return { menage: connu?.menage ?? 20, cuisine: null, cuisinePetitDej: null, cuisineDejeuner: null, cuisineIncluse: false, piscine: null, menageJournalier: 20, menageJournalierIncluse: false };
  }
  return {
    ...TARIFS_PAR_DEFAUT,
    menage: connu?.menage ?? TARIFS_PAR_DEFAUT.menage,
    cuisineIncluse: l.repasInclus,
    menageJournalierIncluse: l.villaId !== null && VILLAS_MENAGE_INCLUS.includes(l.villaId),
  };
}

// Tarifs définis en euros, convertis dans la devise de la réservation (MAD, USD, GBP).
async function tarifsEnDevise(t: TarifsOptions, devise: string): Promise<TarifsOptions> {
  if (codeDevise(devise) === "EUR") return t;
  const c = (m: number | null) => (m === null ? Promise.resolve(null) : tarifEnDevise(m, devise));
  const [menage, cuisine, cuisinePetitDej, cuisineDejeuner, piscine, menageJournalier] = await Promise.all([
    c(t.menage),
    c(t.cuisine),
    c(t.cuisinePetitDej),
    c(t.cuisineDejeuner),
    c(t.piscine),
    c(t.menageJournalier),
  ]);
  return { ...t, menage: menage ?? t.menage, cuisine, cuisinePetitDej, cuisineDejeuner, piscine, menageJournalier };
}

export async function chargerContexteOptions(reservationId: string): Promise<(ContexteOptions & { montantPaye: number | null; devise: string }) | null> {
  const [r] = await getDb()
    .select({
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      fraisMenage: reservations.fraisMenage,
      devise: reservations.devisePaiement,
      villaId: reservations.villaId,
      type: villas.type,
      repasInclus: villas.repasInclusDansLoyer,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return null;
  const devise = r.devise || "EUR";
  return {
    devise,
    nuits: Math.max(1, differenceInCalendarDays(r.checkOut, r.checkIn)),
    loyerTotal: r.loyerTotal != null ? Number(r.loyerTotal) : null,
    montantPaye: r.montantPaye != null ? Number(r.montantPaye) : null,
    fraisMenage: r.fraisMenage != null ? Number(r.fraisMenage) : null,
    tarifs: await tarifsEnDevise(tarifsOptionsLogement({ villaId: r.villaId, type: r.type ?? null, repasInclus: Boolean(r.repasInclus) }), devise),
  };
}
