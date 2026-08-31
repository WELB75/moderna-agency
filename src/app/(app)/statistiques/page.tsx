import { and, asc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, reservations, cashEntries } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { anneeEnd, anneeStart, montantProrata, nuiteesDansLeMois, versEuros } from "@/lib/logement-stats";
import { StatistiquesTable, type LogementMoisStats, type LogementStatsRow } from "@/components/app/statistiques-table";
import { ImportSuperhoteCsvDialog } from "@/components/app/import-superhote-csv-dialog";

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
    return { nuitees: 0, ca: 0, encaisse: 0, depenses: 0, tresorerie: 0 };
  }

  const statsParVilla = new Map<string, LogementMoisStats[]>();
  for (const v of allVillas) {
    statsParVilla.set(v.id, Array.from({ length: 12 }, moisVide));
  }

  // Le loyer/montant payé ne vient jamais automatiquement de Superhote : leur iCal ne transmet
  // pas les prix (limitation du format), donc ces champs ne se remplissent que par saisie
  // manuelle ou par l'import du CSV Superhote (qui, lui, couvre tous les canaux — Direct, Airbnb,
  // Booking.com — pas seulement ce que Kamel encaisse en direct). On compte ici les réservations
  // sans loyer connu pour prévenir Kamel que le CA affiché est sous-estimé tant qu'il n'a pas
  // importé un CSV frais couvrant la période.
  let nbReservationsSansLoyer = 0;
  let nbReservationsAvecNuitsCetteAnnee = 0;

  for (const r of reservationsAnnee) {
    if (!r.villaId) continue;
    const mois = statsParVilla.get(r.villaId);
    if (!mois) continue;
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    const loyerTotal = r.loyerTotal ? Number(r.loyerTotal) : 0;
    const montantPaye = r.montantPaye ? Number(r.montantPaye) : 0;
    let aDesNuitsCetteAnnee = false;
    for (let m = 0; m < 12; m++) {
      const nuits = nuiteesDansLeMois(checkIn, checkOut, year, m);
      if (nuits <= 0) continue;
      aDesNuitsCetteAnnee = true;
      mois[m].nuitees += nuits;
      if (loyerTotal > 0) {
        mois[m].ca += versEuros(montantProrata(loyerTotal, checkIn, checkOut, year, m), r.devisePaiement);
      }
      if (montantPaye > 0) {
        mois[m].encaisse += versEuros(montantProrata(montantPaye, checkIn, checkOut, year, m), r.devisePaiement);
      }
    }
    if (aDesNuitsCetteAnnee) {
      nbReservationsAvecNuitsCetteAnnee++;
      if (loyerTotal <= 0) nbReservationsSansLoyer++;
    }
  }

  for (const d of depensesAnnee) {
    if (!d.villaId) continue;
    const mois = statsParVilla.get(d.villaId);
    if (!mois) continue;
    const m = new Date(d.createdAt).getMonth();
    mois[m].depenses += versEuros(Number(d.montant), d.devise);
  }

  for (const mois of statsParVilla.values()) {
    for (const m of mois) {
      m.tresorerie = m.encaisse - m.depenses;
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

      {nbReservationsSansLoyer > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">{nbReservationsSansLoyer}</span> réservation
            {nbReservationsSansLoyer > 1 ? "s" : ""} sur {nbReservationsAvecNuitsCetteAnnee} n&apos;
            {nbReservationsSansLoyer > 1 ? "ont" : "a"} pas de loyer renseigné (le CA affiché est donc sous-estimé) —
            Superhote ne transmet pas les prix par iCal, quel que soit le canal (Direct, Airbnb, Booking.com) : seul un
            import du CSV Superhote (Calendriers → Actions → Exporter les réservations) les remplit.
          </p>
          <ImportSuperhoteCsvDialog />
        </div>
      ) : null}

      <StatistiquesTable rows={rows} year={year} />
    </div>
  );
}
