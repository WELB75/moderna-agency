import { and, asc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, reservations, cashEntries } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { ajouterMontant, anneeEnd, anneeStart, montantProrata, nuiteesDansLeMois, type MontantParDevise } from "@/lib/logement-stats";
import { StatistiquesTable, type LogementMoisStats, type LogementStatsRow } from "@/components/app/statistiques-table";

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const { annee } = await searchParams;
  const year = Number.isFinite(Number(annee)) && annee ? Math.trunc(Number(annee)) : new Date().getFullYear();
  const db = getDb();

  const debutAnnee = anneeStart(year);
  const finAnneeExclusive = anneeEnd(year);

  const allVillas = (
    await db
      .select({
        id: villas.id,
        nom: villas.nom,
        numero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(asc(domaines.nom), asc(villas.numero))
  ).filter((v) => domaineEstActif(v.domaineNom) && villaEstGeree(v.nom));
  const villaIds = new Set(allVillas.map((v) => v.id));

  // Réservations qui touchent l'année demandée, même partiellement (à cheval sur décembre/janvier) —
  // c'est nuiteesDansLeMois/montantProrata plus bas qui se chargent de ne compter que les nuits
  // réellement dans l'année.
  const reservationsAnnee = (
    await db
      .select({
        villaId: reservations.villaId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        devisePaiement: reservations.devisePaiement,
      })
      .from(reservations)
      .where(and(ne(reservations.status, "annulee"), lt(reservations.checkIn, finAnneeExclusive), isNotNull(reservations.villaId)))
  ).filter((r) => r.villaId && villaIds.has(r.villaId) && new Date(r.checkOut) > debutAnnee);

  const depensesAnnee = (
    await db
      .select({
        villaId: cashEntries.villaId,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        createdAt: cashEntries.createdAt,
      })
      .from(cashEntries)
      .where(and(eq(cashEntries.type, "depense"), gte(cashEntries.createdAt, debutAnnee), lt(cashEntries.createdAt, finAnneeExclusive)))
  ).filter((d) => d.villaId && villaIds.has(d.villaId));

  function moisVide(): LogementMoisStats {
    return { nuitees: 0, ca: [], encaisse: [], depenses: [], tresorerie: [] };
  }

  const statsParVilla = new Map<string, LogementMoisStats[]>();
  for (const v of allVillas) {
    statsParVilla.set(v.id, Array.from({ length: 12 }, moisVide));
  }

  for (const r of reservationsAnnee) {
    if (!r.villaId) continue;
    const mois = statsParVilla.get(r.villaId);
    if (!mois) continue;
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    const loyerTotal = r.loyerTotal ? Number(r.loyerTotal) : 0;
    const montantPaye = r.montantPaye ? Number(r.montantPaye) : 0;
    for (let m = 0; m < 12; m++) {
      const nuits = nuiteesDansLeMois(checkIn, checkOut, year, m);
      if (nuits <= 0) continue;
      mois[m].nuitees += nuits;
      if (loyerTotal > 0) {
        mois[m].ca = ajouterMontant(mois[m].ca, r.devisePaiement, montantProrata(loyerTotal, checkIn, checkOut, year, m));
      }
      if (montantPaye > 0) {
        mois[m].encaisse = ajouterMontant(
          mois[m].encaisse,
          r.devisePaiement,
          montantProrata(montantPaye, checkIn, checkOut, year, m)
        );
      }
    }
  }

  for (const d of depensesAnnee) {
    if (!d.villaId) continue;
    const mois = statsParVilla.get(d.villaId);
    if (!mois) continue;
    const m = new Date(d.createdAt).getMonth();
    mois[m].depenses = ajouterMontant(mois[m].depenses, d.devise, Number(d.montant));
  }

  // Trésorerie = encaissé - dépenses, calculé devise par devise (jamais mélangées : un loyer en
  // EUR et une dépense en MAD restent deux lignes distinctes, voir la page Caisse).
  for (const mois of statsParVilla.values()) {
    for (const m of mois) {
      const devises = new Set([...m.encaisse.map((e) => e.devise), ...m.depenses.map((e) => e.devise)]);
      let tresorerie: MontantParDevise[] = [];
      for (const devise of devises) {
        const encaisse = m.encaisse.find((e) => e.devise === devise)?.montant ?? 0;
        const depense = m.depenses.find((e) => e.devise === devise)?.montant ?? 0;
        tresorerie = ajouterMontant(tresorerie, devise, encaisse - depense);
      }
      m.tresorerie = tresorerie;
    }
  }

  const rows: LogementStatsRow[] = allVillas.map((v) => ({
    villaId: v.id,
    nom: v.nom,
    numero: v.numero,
    domaineNom: v.domaineNom,
    mois: statsParVilla.get(v.id)!,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted-foreground">Nuitées, chiffre d&apos;affaires, trésorerie et dépenses par logement, mois par mois</p>
      </div>

      <StatistiquesTable rows={rows} year={year} />
    </div>
  );
}
