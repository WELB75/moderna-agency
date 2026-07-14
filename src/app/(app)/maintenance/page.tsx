import { desc, eq } from "drizzle-orm";
import { format, isPast, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { maintenanceRecords, villas } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddMaintenanceDialog } from "@/components/app/add-maintenance-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import { Wrench } from "lucide-react";

export default async function MaintenancePage() {
  const db = getDb();

  const records = await db
    .select({
      id: maintenanceRecords.id,
      categorie: maintenanceRecords.categorie,
      equipement: maintenanceRecords.equipement,
      dateIntervention: maintenanceRecords.dateIntervention,
      prochaineDatePrevue: maintenanceRecords.prochaineDatePrevue,
      prestataire: maintenanceRecords.prestataire,
      cout: maintenanceRecords.cout,
      notes: maintenanceRecords.notes,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(maintenanceRecords)
    .leftJoin(villas, eq(maintenanceRecords.villaId, villas.id))
    .orderBy(desc(maintenanceRecords.dateIntervention));

  const allVillas = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas);

  const now = new Date();
  const upcoming = records
    .filter((r) => r.prochaineDatePrevue && differenceInCalendarDays(new Date(r.prochaineDatePrevue), now) <= 30)
    .sort((a, b) => new Date(a.prochaineDatePrevue!).getTime() - new Date(b.prochaineDatePrevue!).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">Historique des entretiens et révisions</p>
        </div>
        <AddMaintenanceDialog villas={allVillas} />
      </div>

      {upcoming.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">À prévoir</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((r) => {
              const overdue = isPast(new Date(r.prochaineDatePrevue!));
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                  <div>
                    <p className="font-medium">{r.equipement}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"}
                    </p>
                  </div>
                  <Badge variant={overdue ? "destructive" : "outline"}>
                    {overdue ? "En retard" : "Prévu"} ·{" "}
                    {format(new Date(r.prochaineDatePrevue!), "d MMM yyyy", { locale: fr })}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Wrench className="h-8 w-8" />
            <p>Aucun entretien enregistré pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.categorie}</Badge>
                    <p className="font-medium">{r.equipement}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"} ·{" "}
                    {format(new Date(r.dateIntervention), "d MMM yyyy", { locale: fr })}
                    {r.prestataire ? ` · ${r.prestataire}` : ""}
                    {r.cout ? ` · ${Number(r.cout).toFixed(2)} €` : ""}
                  </p>
                  {r.notes ? <p className="mt-1 text-sm">{r.notes}</p> : null}
                  {r.prochaineDatePrevue ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Prochaine échéance : {format(new Date(r.prochaineDatePrevue), "d MMM yyyy", { locale: fr })}
                    </p>
                  ) : null}
                </div>
                <ConfirmDeleteButton
                  action={deleteMaintenanceRecord.bind(null, r.id)}
                  title="Supprimer cet entretien ?"
                  description="Cette action est irréversible."
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
