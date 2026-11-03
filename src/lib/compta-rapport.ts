import { differenceInCalendarDays } from "date-fns";
import { and, gte, inArray, lt, ne, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries, domaines, personnel, personnelAffectations, reservations, villas } from "@/db/schema";
import { normaliseCanal } from "@/lib/canal";
import { periodeBounds } from "@/lib/caisse-periode";
import { calculerCouts, lignesDesReservations } from "@/lib/compta-reservation";
import {
  arrondir,
  convertir,
  ventiler,
  type CoutSejour,
  type LigneFacture,
  type Ventilation,
} from "@/lib/compta-reservation-format";
import { getMadParEur } from "@/lib/devises";
import { villaEstGeree } from "@/lib/domaines-actifs";

// Rapport comptable par réservation, pour la période de la comptable (11 du mois → 10 du suivant,
// voir caisse-periode.ts). Choix : une réservation compte dans la période où le client PART
// (séjour terminé, donc ménage et cuisine faits), pas celle de l'arrivée. Sont exclus les
// annulations, les blocages (propriétaire, travaux, famille) et les logements retirés de la gestion.
// Tout est ramené en euros (les dépenses sont saisies en dirhams) au taux du jour.

export type LigneRapport = {
  id: string;
  depart: Date;
  arrivee: Date;
  nuits: number;
  client: string;
  logement: string;
  canal: string;
  deviseOrigine: string;
  lignes: LigneFacture[];
  ventilation: Ventilation; // en euros
  facturation: { sejour: number; menage: number; options: number };
  detaille: boolean;
  notesPaiement: string | null;
};

export type RapportCompta = {
  lignes: LigneRapport[];
  madParEur: number;
  totaux: {
    facture: number;
    encaisse: number;
    reste: number;
    sejour: number;
    menage: number;
    options: number;
    coutMenage: number;
    coutCuisine: number;
    coutAutres: number;
    totalCouts: number;
    solde: number;
    nonDetailles: number;
  };
};

const sommeCouts = (couts: CoutSejour[], categorie: CoutSejour["categorie"]) =>
  arrondir(couts.filter((c) => c.categorie === categorie).reduce((s, c) => s + c.montant, 0));

export async function chargerRapportCompta(ancre: Date): Promise<RapportCompta> {
  const db = getDb();
  const { debut, finExclusive } = periodeBounds(ancre);
  const madParEur = await getMadParEur();

  const resas = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        canal: reservations.canal,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        devise: reservations.devisePaiement,
        notesPaiement: reservations.notesPaiement,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        nbChambres: villas.nbChambres,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .innerJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, debut), lt(reservations.checkOut, finExclusive)))
  )
    .filter((r) => normaliseCanal(r.canal) !== "bloque" && villaEstGeree(r.villaNom))
    .sort((a, b) => a.checkOut.getTime() - b.checkOut.getTime());

  const ids = resas.map((r) => r.id);
  const lignesParResa = await lignesDesReservations(ids);

  const affectations = ids.length
    ? await db
        .select({
          reservationId: personnelAffectations.reservationId,
          role: personnel.role,
          nom: personnel.nom,
          moment: personnelAffectations.moment,
          faitAt: personnelAffectations.faitAt,
          nbJours: personnelAffectations.nbJours,
          avecDejeuner: personnelAffectations.avecDejeuner,
        })
        .from(personnelAffectations)
        .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
        .where(inArray(personnelAffectations.reservationId, ids))
    : [];

  const depenses = ids.length
    ? await db
        .select({
          reservationId: cashEntries.reservationId,
          id: cashEntries.id,
          categorie: cashEntries.categorie,
          montant: cashEntries.montant,
          devise: cashEntries.devise,
          description: cashEntries.description,
        })
        .from(cashEntries)
        .where(and(inArray(cashEntries.reservationId, ids), eq(cashEntries.type, "depense")))
    : [];

  const lignes: LigneRapport[] = resas.map((r) => {
    const devise = "EUR";
    const deviseOrigine = r.devise || "EUR";
    const nuits = Math.max(0, differenceInCalendarDays(r.checkOut, r.checkIn));
    const aEUR = (m: number) => arrondir(convertir(m, deviseOrigine, devise, madParEur));

    const lignesOrigine = lignesParResa.get(r.id) ?? [];
    const lignesEur = lignesOrigine.map((l) => ({ ...l, prixUnitaire: aEUR(l.prixUnitaire) }));

    const couts = calculerCouts({
      devise,
      nuits,
      domaineNom: r.domaineNom,
      nbChambres: r.nbChambres,
      madParEur,
      affectations: affectations.filter((a) => a.reservationId === r.id),
      depenses: depenses.filter((d) => d.reservationId === r.id),
    });

    const loyer = r.loyerTotal != null ? aEUR(Number(r.loyerTotal)) : null;
    const ventilation = ventiler({
      devise,
      loyerTotal: loyer,
      montantPaye: r.montantPaye != null ? aEUR(Number(r.montantPaye)) : null,
      lignes: lignesEur,
      couts,
    });

    const parCat = (cat: string) => arrondir(lignesEur.filter((l) => l.categorie === cat).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0));
    const detaille = lignesEur.length > 0;
    const totalDu = detaille ? ventilation.facture : (loyer ?? 0);
    const sejour = detaille ? parCat("sejour") : totalDu;
    const menage = detaille ? parCat("menage") : 0;

    return {
      id: r.id,
      depart: r.checkOut,
      arrivee: r.checkIn,
      nuits,
      client: r.guestName,
      logement: r.villaNumero && r.villaNumero !== "?" ? `${r.villaNom} (n°${r.villaNumero})` : (r.villaNom ?? "—"),
      canal: r.canal ?? "Direct",
      deviseOrigine,
      lignes: lignesEur,
      ventilation,
      facturation: { sejour, menage, options: arrondir(totalDu - sejour - menage) },
      detaille,
      notesPaiement: r.notesPaiement,
    };
  });

  const somme = (f: (l: LigneRapport) => number) => arrondir(lignes.reduce((s, l) => s + f(l), 0));
  return {
    lignes,
    madParEur,
    totaux: {
      facture: somme((l) => (l.detaille ? l.ventilation.facture : l.facturation.sejour)),
      encaisse: somme((l) => l.ventilation.encaisse),
      reste: somme((l) => l.ventilation.reste),
      sejour: somme((l) => l.facturation.sejour),
      menage: somme((l) => l.facturation.menage),
      options: somme((l) => l.facturation.options),
      coutMenage: somme((l) => sommeCouts(l.ventilation.couts, "menage")),
      coutCuisine: somme((l) => sommeCouts(l.ventilation.couts, "cuisine")),
      coutAutres: somme((l) => sommeCouts(l.ventilation.couts, "caisse")),
      totalCouts: somme((l) => l.ventilation.totalCouts),
      solde: somme((l) => l.ventilation.solde),
      nonDetailles: lignes.filter((l) => !l.detaille).length,
    },
  };
}

function csvCellule(v: string | number): string {
  const t = String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// Séparateur point-virgule et virgule décimale : s'ouvre directement dans Excel en français.
export function rapportEnCsv(r: RapportCompta): string {
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const entetes = [
    "Départ", "Arrivée", "Nuits", "Client", "Logement", "Canal",
    "Séjour (EUR)", "Ménage facturé (EUR)", "Options (EUR)", "Total facturé (EUR)", "Encaissé (EUR)", "Reste (EUR)",
    "Frais ménage (EUR)", "Frais cuisine (EUR)", "Autres dépenses (EUR)", "Total frais (EUR)", "Encaissé moins frais (EUR)",
    "Détail renseigné", "Règlement",
  ];
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  const rows = r.lignes.map((l) => {
    const v = l.ventilation;
    return [
      jour(l.depart), jour(l.arrivee), l.nuits, l.client, l.logement, l.canal,
      num(l.facturation.sejour), num(l.facturation.menage), num(l.facturation.options),
      num(l.detaille ? v.facture : l.facturation.sejour), num(v.encaisse), num(v.reste),
      num(sommeCouts(v.couts, "menage")), num(sommeCouts(v.couts, "cuisine")), num(sommeCouts(v.couts, "caisse")),
      num(v.totalCouts), num(v.solde), l.detaille ? "oui" : "non", l.notesPaiement ?? "",
    ];
  });
  const t = r.totaux;
  rows.push([
    "TOTAL", "", "", "", "", "",
    num(t.sejour), num(t.menage), num(t.options), num(t.facture), num(t.encaisse), num(t.reste),
    num(t.coutMenage), num(t.coutCuisine), num(t.coutAutres), num(t.totalCouts), num(t.solde), "", "",
  ]);
  return "﻿" + [entetes, ...rows].map((ligne) => ligne.map(csvCellule).join(";")).join("\r\n");
}
