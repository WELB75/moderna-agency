import { desc, eq, and, gte, lt } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { cashEntries, villas, domaines, reservations } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { periodeAncre, periodeBounds } from "@/lib/caisse-periode";
import { CATEGORIE_LABELS, TYPE_LABELS, type Entry } from "@/lib/caisse-labels";

const MOYEN_LABELS: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement bancaire",
  carte: "Carte bleue",
};

export default async function CaisseRapportPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const db = getDb();

  const { mois } = await searchParams;
  const moisAncre = periodeAncre(mois);
  const { debut: debutMois, finExclusive: finMoisExclusive, finAffichee } = periodeBounds(moisAncre);

  const entries = (
    await db
      .select({
        id: cashEntries.id,
        type: cashEntries.type,
        categorie: cashEntries.categorie,
        caisse: cashEntries.caisse,
        financePar: cashEntries.financePar,
        moyenPaiement: cashEntries.moyenPaiement,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        description: cashEntries.description,
        responsable: cashEntries.responsable,
        photoUrls: cashEntries.photoUrls,
        createdByName: cashEntries.createdByName,
        createdAt: cashEntries.createdAt,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
        guestName: reservations.guestName,
      })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .leftJoin(reservations, eq(cashEntries.reservationId, reservations.id))
      .where(and(gte(cashEntries.createdAt, debutMois), lt(cashEntries.createdAt, finMoisExclusive)))
      .orderBy(desc(cashEntries.createdAt))
  ).filter((e) => domaineEstActif(e.domaineNom));

  const entriesSociete = entries.filter((e) => e.caisse === "societe");
  const entriesBrahim = entries.filter((e) => e.caisse === "brahim");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="font-semibold">Rapport de caisse — comptabilité</p>
          <p className="text-sm text-muted-foreground">
            {format(debutMois, "d MMM", { locale: fr })} → {format(finAffichee, "d MMM yyyy", { locale: fr })}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="hidden items-center justify-between print:flex">
        <Logo size={56} />
        <div className="text-right">
          <p className="text-lg font-semibold">Rapport de caisse</p>
          <p className="text-sm text-muted-foreground">
            Période du {format(debutMois, "d MMMM", { locale: fr })} au {format(finAffichee, "d MMMM yyyy", { locale: fr })}
          </p>
          <p className="text-xs text-muted-foreground">Édité le {format(new Date(), "d MMMM yyyy", { locale: fr })}</p>
        </div>
      </div>

      <RapportSection titre="Caisse société" entries={entriesSociete} />
      {entriesBrahim.length > 0 ? <RapportSection titre="Caisse Brahim" entries={entriesBrahim} /> : null}
    </div>
  );
}

function RapportSection({ titre, entries }: { titre: string; entries: Entry[] }) {
  const devises = entries.length > 0 ? Array.from(new Set(entries.map((e) => e.devise))).sort() : ["MAD"];

  return (
    <div className="space-y-4 break-inside-avoid">
      <h2 className="text-base font-semibold">{titre}</h2>
      {devises.map((devise) => {
        const enDevise = entries.filter((e) => e.devise === devise);
        const moyens = Array.from(new Set(enDevise.map((e) => e.moyenPaiement)));

        return (
          <div key={devise} className="space-y-4">
            {moyens.map((moyen) => (
              <MoyenTable
                key={moyen}
                titre={`${MOYEN_LABELS[moyen] ?? moyen} (${devise})`}
                entries={enDevise.filter((e) => e.moyenPaiement === moyen)}
                devise={devise}
              />
            ))}
            <TotauxDevise entries={enDevise} devise={devise} />
          </div>
        );
      })}
    </div>
  );
}

function MoyenTable({ titre, entries, devise }: { titre: string; entries: Entry[]; devise: string }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5 break-inside-avoid">
      <p className="text-sm font-medium">{titre}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2 font-medium">Date</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 font-medium">Bien</th>
              <th className="p-2 font-medium">Client</th>
              <th className="p-2 font-medium">Description</th>
              <th className="p-2 font-medium">Responsable</th>
              <th className="p-2 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="whitespace-nowrap p-2">{format(new Date(e.createdAt), "d MMM yyyy", { locale: fr })}</td>
                <td className="whitespace-nowrap p-2">
                  {TYPE_LABELS[e.type] ?? e.type}
                  {e.categorie ? ` · ${CATEGORIE_LABELS[e.categorie] ?? e.categorie}` : ""}
                </td>
                <td className="whitespace-nowrap p-2">
                  {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "—"}
                </td>
                <td className="whitespace-nowrap p-2">{e.guestName ?? "—"}</td>
                <td className="p-2">{e.description ?? "—"}</td>
                <td className="whitespace-nowrap p-2">{e.responsable ?? "—"}</td>
                <td className="whitespace-nowrap p-2 text-right font-medium">
                  {e.type === "remise" || e.type === "loyer" || e.type === "extra" ? "+" : "-"}
                  {Number(e.montant).toFixed(2)} {devise}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotauxDevise({ entries, devise }: { entries: Entry[]; devise: string }) {
  const totalLoyer = entries.filter((e) => e.type === "loyer").reduce((s, e) => s + Number(e.montant), 0);
  const totalExtra = entries.filter((e) => e.type === "extra").reduce((s, e) => s + Number(e.montant), 0);
  const totalRemise = entries.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
  const totalDepenseSociete = entries
    .filter((e) => e.type === "depense" && e.financePar === "societe")
    .reduce((s, e) => s + Number(e.montant), 0);
  const totalDepenseLoyers = entries
    .filter((e) => e.type === "depense" && e.financePar === "loyers_perso")
    .reduce((s, e) => s + Number(e.montant), 0);
  const totalRestitution = entries.filter((e) => e.type === "restitution").reduce((s, e) => s + Number(e.montant), 0);
  const solde = totalRemise - totalDepenseSociete - totalRestitution;

  const lignes = [
    ["Total loyers reçus", totalLoyer],
    ["Extras (petit-déj, options...)", totalExtra],
    ["Total confié (remise)", totalRemise],
    ["Total dépenses (financées société)", totalDepenseSociete],
    ["Total dépenses (financées loyers perso)", totalDepenseLoyers],
    ["Total restitué", totalRestitution],
    ["Solde", solde],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border p-3 text-sm sm:grid-cols-4">
      {lignes.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-semibold">
            {value.toFixed(2)} {devise}
          </p>
        </div>
      ))}
    </div>
  );
}
