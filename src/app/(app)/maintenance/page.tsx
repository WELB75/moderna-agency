import { desc, eq } from "drizzle-orm";
import { format, isPast, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { maintenanceRecords, villas, technicians, taches, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddMaintenanceDialog } from "@/components/app/add-maintenance-dialog";
import { AddTechnicianDialog } from "@/components/app/add-technician-dialog";
import { AddTacheDialog } from "@/components/app/add-tache-dialog";
import { TacheBoard } from "@/components/app/tache-board";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { PhoneLink } from "@/components/app/phone-link";
import { deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import { deleteTechnician } from "@/lib/actions/technicians";
import { Wrench, Users, ListTodo } from "lucide-react";
import { nowInMorocco } from "@/lib/now";

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
  const allTechnicians = await db.select().from(technicians).orderBy(technicians.nom);

  const allVillasWithDomaine = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id));

  const allTaches = await db
    .select({
      id: taches.id,
      titre: taches.titre,
      description: taches.description,
      statut: taches.statut,
      photoUrls: taches.photoUrls,
      createdAt: taches.createdAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
    })
    .from(taches)
    .leftJoin(villas, eq(taches.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .orderBy(desc(taches.createdAt));

  const now = nowInMorocco();
  const upcoming = records
    .filter((r) => r.prochaineDatePrevue && differenceInCalendarDays(new Date(r.prochaineDatePrevue), now) <= 30)
    .sort((a, b) => new Date(a.prochaineDatePrevue!).getTime() - new Date(b.prochaineDatePrevue!).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
        <p className="text-sm text-muted-foreground">Entretiens, révisions et carnet des techniciens</p>
      </div>

      <Tabs defaultValue="entretiens">
        <TabsList>
          <TabsTrigger value="entretiens">
            <Wrench className="h-4 w-4" />
            Entretiens
          </TabsTrigger>
          <TabsTrigger value="techniciens">
            <Users className="h-4 w-4" />
            Techniciens
          </TabsTrigger>
          <TabsTrigger value="taches">
            <ListTodo className="h-4 w-4" />
            Tâches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entretiens" className="space-y-6">
          <div className="flex justify-end">
            <AddMaintenanceDialog villas={allVillas} technicians={allTechnicians} />
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
                        {r.cout ? ` · ${Number(r.cout).toFixed(2)} DH` : ""}
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
        </TabsContent>

        <TabsContent value="techniciens" className="space-y-6">
          <div className="flex justify-end">
            <AddTechnicianDialog />
          </div>

          {allTechnicians.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Users className="h-8 w-8" />
                <p>Aucun technicien enregistré pour l&apos;instant.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {allTechnicians.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{t.nom}</p>
                    <p className="text-sm text-muted-foreground">{t.fonction}</p>
                    {t.notes ? <p className="mt-1 text-sm text-muted-foreground">{t.notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <PhoneLink phone={t.telephone} />
                    <ConfirmDeleteButton
                      action={deleteTechnician.bind(null, t.id)}
                      title="Supprimer ce technicien ?"
                      description="Cette action est irréversible."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="taches" className="space-y-6">
          <div className="flex justify-end">
            <AddTacheDialog villas={allVillasWithDomaine} />
          </div>

          <TacheBoard
            taches={allTaches.map((t) => ({
              ...t,
              photoUrls: t.photoUrls ?? [],
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
