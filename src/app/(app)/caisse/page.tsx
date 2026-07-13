import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { cashEntries, villas } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddCashEntryDialog } from "@/components/app/add-cash-entry-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteCashEntry } from "@/lib/actions/caisse";

const TYPE_LABELS: Record<string, string> = {
  remise: "Argent confié",
  depense: "Dépense",
  restitution: "Restitution",
};

export default async function CaissePage() {
  const db = getDb();

  const entries = await db
    .select({
      id: cashEntries.id,
      type: cashEntries.type,
      montant: cashEntries.montant,
      description: cashEntries.description,
      createdByName: cashEntries.createdByName,
      createdAt: cashEntries.createdAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(cashEntries)
    .leftJoin(villas, eq(cashEntries.villaId, villas.id))
    .orderBy(desc(cashEntries.createdAt));

  const allVillas = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas);

  const totalRemise = entries.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
  const totalDepense = entries.filter((e) => e.type === "depense").reduce((s, e) => s + Number(e.montant), 0);
  const totalRestitution = entries
    .filter((e) => e.type === "restitution")
    .reduce((s, e) => s + Number(e.montant), 0);
  const balance = totalRemise - totalDepense - totalRestitution;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>
          <p className="text-sm text-muted-foreground">Argent confié, dépenses et restitutions</p>
        </div>
        <AddCashEntryDialog villas={allVillas} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Solde actuel" value={balance} highlight />
        <SummaryCard label="Total confié" value={totalRemise} />
        <SummaryCard label="Total dépensé" value={totalDepense} />
        <SummaryCard label="Total restitué" value={totalRestitution} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mouvements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={e.type === "remise" ? "secondary" : "outline"}>
                      {TYPE_LABELS[e.type]}
                    </Badge>
                    <span className="font-semibold">
                      {e.type === "remise" ? "+" : "-"}
                      {Number(e.montant).toFixed(2)} €
                    </span>
                  </div>
                  {e.description ? <p className="mt-1 text-sm">{e.description}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.villaNom ? `${e.villaNom} (n°${e.villaNumero}) · ` : ""}
                    {e.createdByName ?? "Équipe"} ·{" "}
                    {format(new Date(e.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                  </p>
                </div>
                <ConfirmDeleteButton
                  action={deleteCashEntry.bind(null, e.id)}
                  title="Supprimer ce mouvement ?"
                  description="Cette action est irréversible."
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={highlight ? "text-2xl font-semibold text-primary" : "text-2xl font-semibold"}>
          {value.toFixed(2)} €
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
