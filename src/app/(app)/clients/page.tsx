import { asc, ne, eq } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { clients, reservations, villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddClientDialog } from "@/components/app/add-client-dialog";
import { EditClientDialog } from "@/components/app/edit-client-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { PhoneLink } from "@/components/app/phone-link";
import { deleteClient } from "@/lib/actions/clients";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { phonesMatch } from "@/lib/phone";

export default async function ClientsPage() {
  const db = getDb();

  const allClients = await db.select().from(clients).orderBy(asc(clients.nom));

  // Rapprochement par téléphone (pas par nom, trop instable) avec les séjours passés, pour
  // afficher directement "3 séjours" et l'historique sur la fiche client sans ressaisie.
  const pastStays = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(ne(reservations.status, "annulee"))
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => domaineEstActif(r.domaineNom));

  const clientsWithStays = allClients.map((c) => {
    const stays = c.telephone ? pastStays.filter((r) => phonesMatch(c.telephone, r.guestPhone)) : [];
    return { ...c, stays: stays.reverse() };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Habitudes et préférences des voyageurs, pour les reconnaître s&apos;ils reviennent.
          </p>
        </div>
        <AddClientDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{allClients.length} client{allClients.length > 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {clientsWithStays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun client enregistré pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2">
              {clientsWithStays.map((c) => (
                <div key={c.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{c.nom}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.telephone ? <PhoneLink phone={c.telephone} /> : null}
                        {c.email ? <span className="text-sm text-muted-foreground">{c.email}</span> : null}
                        {c.stays.length > 0 ? (
                          <Badge variant="secondary">
                            {c.stays.length} séjour{c.stays.length > 1 ? "s" : ""}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <EditClientDialog clientId={c.id} nom={c.nom} telephone={c.telephone} email={c.email} notes={c.notes} />
                      <ConfirmDeleteButton
                        action={deleteClient.bind(null, c.id)}
                        title={`Supprimer ${c.nom} ?`}
                        description="Ses habitudes et son historique de rapprochement seront perdus."
                      />
                    </div>
                  </div>

                  {c.notes ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
                      {c.notes}
                    </p>
                  ) : null}

                  {c.stays.length > 0 ? (
                    <div className="space-y-1 border-t pt-2 text-sm text-muted-foreground">
                      {c.stays.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {s.villaNom ? `${s.villaNom} (n°${s.villaNumero})` : "Villa non renseignée"}
                            {s.guestName !== c.nom ? ` · réservé au nom de ${s.guestName}` : ""}
                          </span>
                          <span>
                            {format(new Date(s.checkIn), "d MMM", { locale: fr })} →{" "}
                            {format(new Date(s.checkOut), "d MMM yyyy", { locale: fr })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
