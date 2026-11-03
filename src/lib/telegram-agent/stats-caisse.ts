import { and, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries, domaines, reservations, villas } from "@/db/schema";
import { getMadParEur } from "@/lib/devises";
import { domaineEstActif, logementEstIntegre } from "@/lib/domaines-actifs";
import { normaliseCanal, SOURCE_META, type CanalKey } from "@/lib/canal";
import { montantProrata, nuiteesDansLeMois, versEuros } from "@/lib/logement-stats";
import { chargerEquipiersTournees, villasDuPassage } from "@/lib/tournees";
import { jourSemaineNumero, nomJour, passagesDuJour, texteLieu, type EquipierTournee } from "@/lib/tournees-format";

// Outils de consultation de l'assistant Telegram : statistiques de tous les logements (Airbnb,
// Booking.com, direct ; villas et appartements), détail de la caisse, tournées du jardinier et du
// pisciniste. Kamel, 2026-11-03 : « connecter la caisse et les statistiques de tous les biens ».
// Mêmes règles de calcul que la page Statistiques (lib/logement-stats.ts) : nuitées prorata du mois,
// montants convertis en euros.

const arrondi = (n: number) => Math.round(n * 100) / 100;
const MAROC = "+01:00";

function jourMaroc(valeur: string | undefined): Date | null {
  if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
  const d = new Date(`${valeur}T00:00:00${MAROC}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------- statistiques

type Cumul = { resas: number; nuitees: number; ca: number; encaisse: number };
const vide = (): Cumul => ({ resas: 0, nuitees: 0, ca: 0, encaisse: 0 });

export async function getStatistiques(input: { annee?: number; mois?: number; type?: string }, voirTout: boolean) {
  const annee = Number.isFinite(input.annee) && input.annee ? Math.trunc(input.annee) : new Date().getFullYear();
  const mois = Number.isFinite(input.mois) && input.mois && input.mois >= 1 && input.mois <= 12 ? Math.trunc(input.mois) : null;
  const type = input.type === "villa" || input.type === "appartement" ? input.type : "total";
  const indicesMois = mois ? [mois - 1] : Array.from({ length: 12 }, (_, i) => i);
  const debut = new Date(annee, indicesMois[0], 1);
  const finExclue = new Date(annee, indicesMois[indicesMois.length - 1] + 1, 1);
  const joursPeriode = Math.round((finExclue.getTime() - debut.getTime()) / 86_400_000);

  const db = getDb();
  const madParEur = await getMadParEur();

  const logements = (
    await db
      .select({ id: villas.id, nom: villas.nom, type: villas.type, beds24RoomId: villas.beds24RoomId, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((v) => (voirTout || logementEstIntegre(v)) && (type === "total" || v.type === type));
  const parId = new Map(logements.map((v) => [v.id, v]));

  const resas = (
    await db
      .select({
        villaId: reservations.villaId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        devisePaiement: reservations.devisePaiement,
        canal: reservations.canal,
      })
      .from(reservations)
      .where(and(ne(reservations.status, "annulee"), lt(reservations.checkIn, finExclue), isNotNull(reservations.villaId)))
  ).filter((r) => r.villaId && parId.has(r.villaId) && new Date(r.checkOut) > debut);

  const CANAUX: CanalKey[] = ["airbnb", "booking", "direct", "autre", "bloque"];
  const parCanal = Object.fromEntries(CANAUX.map((c) => [c, vide()])) as Record<CanalKey, Cumul>;
  const parType: Record<"villa" | "appartement", Cumul> = { villa: vide(), appartement: vide() };
  const parLogement = new Map<string, Cumul>(logements.map((v) => [v.id, vide()]));
  // Croisement canal x type : « combien Airbnb sur les appartements ? »
  const canalParType: Record<"villa" | "appartement", Record<CanalKey, Cumul>> = {
    villa: Object.fromEntries(CANAUX.map((c) => [c, vide()])) as Record<CanalKey, Cumul>,
    appartement: Object.fromEntries(CANAUX.map((c) => [c, vide()])) as Record<CanalKey, Cumul>,
  };

  for (const r of resas) {
    const logement = parId.get(r.villaId!)!;
    const canal = normaliseCanal(r.canal);
    const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
    const paye = r.montantPaye ? Number(r.montantPaye) : 0;
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    let nuitsTotal = 0;
    const cibles = [parCanal[canal], parLogement.get(logement.id)!, canalParType[logement.type][canal]];
    if (canal !== "bloque") cibles.push(parType[logement.type]);
    for (const m of indicesMois) {
      const nuits = nuiteesDansLeMois(checkIn, checkOut, annee, m);
      if (nuits <= 0) continue;
      nuitsTotal += nuits;
      const ca = loyer > 0 ? versEuros(montantProrata(loyer, checkIn, checkOut, annee, m), r.devisePaiement, madParEur) : 0;
      const enc = paye > 0 ? versEuros(montantProrata(paye, checkIn, checkOut, annee, m), r.devisePaiement, madParEur) : 0;
      for (const c of cibles) {
        c.nuitees += nuits;
        c.ca += ca;
        c.encaisse += enc;
      }
    }
    if (nuitsTotal > 0) for (const c of cibles) c.resas += 1;
  }

  const depenses = (
    await db
      .select({ villaId: cashEntries.villaId, montant: cashEntries.montant, devise: cashEntries.devise })
      .from(cashEntries)
      .where(and(eq(cashEntries.type, "depense"), gte(cashEntries.createdAt, debut), lt(cashEntries.createdAt, finExclue)))
  ).filter((d) => d.villaId && parId.has(d.villaId));
  const depensesEur = depenses.reduce((s, d) => s + versEuros(Number(d.montant), d.devise, madParEur), 0);

  const mise = (c: Cumul) => ({ reservations: c.resas, nuitees: c.nuitees, ca_eur: arrondi(c.ca), encaisse_eur: arrondi(c.encaisse) });
  const vendu = (c: Record<CanalKey, Cumul>) => CANAUX.filter((k) => k !== "bloque").reduce((s, k) => s + c[k].nuitees, 0);
  const nuitsDispo = logements.length * joursPeriode;
  const nuitsVendues = vendu(parCanal);
  const totalCa = CANAUX.filter((k) => k !== "bloque").reduce((s, k) => s + parCanal[k].ca, 0);
  const totalEncaisse = CANAUX.filter((k) => k !== "bloque").reduce((s, k) => s + parCanal[k].encaisse, 0);

  return {
    periode: mois ? `${String(mois).padStart(2, "0")}/${annee}` : String(annee),
    perimetre: `${type === "total" ? "villas et appartements" : type === "villa" ? "villas" : "appartements"} (${logements.length} logements${voirTout ? ", tous" : ""})`,
    note: "Montants en euros (dirhams convertis). CA = loyers des réservations non annulées, au prorata des nuits de la période. Les blocages (propriétaire, travaux, famille) ne comptent pas dans le CA ni le taux d'occupation.",
    total: {
      nuitees_vendues: nuitsVendues,
      ca_eur: arrondi(totalCa),
      encaisse_eur: arrondi(totalEncaisse),
      taux_occupation_pct: nuitsDispo > 0 ? arrondi((nuitsVendues / nuitsDispo) * 100) : 0,
      depenses_caisse_eur: arrondi(depensesEur),
      tresorerie_eur: arrondi(totalEncaisse - depensesEur),
    },
    par_canal: Object.fromEntries(CANAUX.filter((k) => parCanal[k].resas > 0).map((k) => [SOURCE_META[k].label, mise(parCanal[k])])),
    par_type: { villas: mise(parType.villa), appartements: mise(parType.appartement) },
    canal_par_type: Object.fromEntries(
      (["villa", "appartement"] as const).map((t) => [
        t === "villa" ? "villas" : "appartements",
        Object.fromEntries(CANAUX.filter((k) => k !== "bloque" && canalParType[t][k].resas > 0).map((k) => [SOURCE_META[k].label, mise(canalParType[t][k])])),
      ])
    ),
    par_logement: logements
      .map((v) => ({ logement: v.nom, type: v.type, ...mise(parLogement.get(v.id)!) }))
      .filter((l) => l.nuitees > 0)
      .sort((a, b) => b.ca_eur - a.ca_eur),
  };
}

// ---------------------------------------------------------------- caisse

export async function getCaisseDetail(
  input: { du?: string; au?: string; villaNom?: string; domaineNom?: string; type?: string; limite?: number },
  voirTout: boolean
) {
  const db = getDb();
  const du = jourMaroc(input.du);
  const au = jourMaroc(input.au);
  const rows = (
    await db
      .select({
        createdAt: cashEntries.createdAt,
        type: cashEntries.type,
        financePar: cashEntries.financePar,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        description: cashEntries.description,
        responsable: cashEntries.responsable,
        villaNom: villas.nom,
        domaineNom: domaines.nom,
      })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((r) => {
    // Même règle que le solde de caisse : domaine mis de côté masqué, sauf pour qui voit tout.
    if (!voirTout && !domaineEstActif(r.domaineNom)) return false;
    if (du && r.createdAt < du) return false;
    // `au` est inclus : jusqu'à la fin de ce jour.
    if (au && r.createdAt >= new Date(au.getTime() + 86_400_000)) return false;
    if (input.type && r.type !== input.type) return false;
    if (input.villaNom && !(r.villaNom ?? "").toLowerCase().includes(input.villaNom.toLowerCase())) return false;
    if (input.domaineNom && !(r.domaineNom ?? "").toLowerCase().includes(input.domaineNom.toLowerCase())) return false;
    return true;
  });

  const totaux: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const t = (totaux[r.devise] ??= {});
    const cle = r.type === "depense" ? (r.financePar === "loyers_perso" ? "depense_loyers_perso" : "depense_societe") : r.type;
    t[cle] = arrondi((t[cle] ?? 0) + Number(r.montant));
  }
  const limite = Math.min(Math.max(Math.trunc(input.limite ?? 15), 1), 40);
  const dernieres = [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limite)
    .map((r) => ({
      date: r.createdAt.toISOString().slice(0, 10),
      type: r.type,
      montant: Number(r.montant),
      devise: r.devise,
      description: r.description,
      logement: r.villaNom,
      responsable: r.responsable,
      paye_avec: r.type === "depense" ? (r.financePar === "loyers_perso" ? "loyers perso" : "argent de la société") : undefined,
    }));
  return {
    filtre: { du: input.du ?? null, au: input.au ?? null, villa: input.villaNom ?? null, domaine: input.domaineNom ?? null, type: input.type ?? null },
    nb_mouvements: rows.length,
    totaux_par_devise: totaux,
    derniers_mouvements: dernieres,
  };
}

// ---------------------------------------------------------------- tournées

export async function getTournees(input: { nom?: string; date?: string }) {
  const equipiers = await chargerEquipiersTournees();
  const q = (input.nom ?? "").trim().toLowerCase();
  const retenus = q ? equipiers.filter((e) => e.nom.toLowerCase().includes(q) || e.metier.includes(q) || (q === "piscine" && e.metier === "pisciniste")) : equipiers;
  if (retenus.length === 0) return { erreur: "Personne de ce nom dans les tournées (Brahim, jardinier, et Rachid, pisciniste)." };

  async function decrire(e: EquipierTournee, jour: number) {
    const passages = passagesDuJour(e, jour);
    return {
      jour: nomJour(jour),
      programme: await Promise.all(
        passages.map(async (p) => ({
          resume: texteLieu(p),
          domaine: p.domaine,
          villas_numeros: p.villas,
          logements_dans_l_app: (await villasDuPassage(p)).map((v) => `${v.nom} (n°${v.numero})`),
          remarque: p.note,
        }))
      ),
    };
  }

  const date = input.date ? new Date(`${input.date}T12:00:00`) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const jour = jourSemaineNumero(date);
    return {
      date: input.date,
      jour: nomJour(jour),
      equipe: await Promise.all(retenus.map(async (e) => ({ nom: e.nom, metier: e.metier, ...(await decrire(e, jour)) }))),
    };
  }
  return {
    semaine_type: "Planning identique chaque semaine.",
    equipe: await Promise.all(
      retenus.map(async (e) => ({ nom: e.nom, metier: e.metier, semaine: await Promise.all([1, 2, 3, 4, 5, 6, 7].map((j) => decrire(e, j))) }))
    ),
  };
}
