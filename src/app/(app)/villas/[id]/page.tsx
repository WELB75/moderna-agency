import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations, inventoryChecklists } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AddReservationDialog } from "@/components/app/add-reservation-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ReservationDates } from "@/components/app/reservation-dates";
import { deleteVilla } from "@/lib/actions/villas";
import { deleteReservation } from "@/lib/actions/reservations";
import { ClipboardPlus } from "lucide-react";

export default async function VillaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [villa] = await db.select().from(villas).where(eq(villas.id, id)).limit(1);
  if (!villa) notFound();

  const villaReservations = await db
    .select()
    .from(reservations)
    .where(eq(reservations.villaId, id))
    .orderBy(desc(reservations.checkIn));

  const checklists = await db
    .select()
    .from(inventoryChecklists)
    .where(eq(inventoryChecklists.villaId, id))
    .orderBy(desc(inventoryChecklists.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{villa.nom}</h1>
          <p className="text-sm text-muted-foreground">
            Villa n°{villa.numero}
            {villa.adresse ? ` · ${villa.adresse}` : ""}
          </p>
        </div>
        <ConfirmDeleteButton
          action={deleteVilla.bind(null, villa.id)}
          title="Supprimer cette villa ?"
          description="Les réservations et inventaires liés seront également supprimés."
          label="Supprimer la villa"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/inventaire/nouveau?villaId=${villa.id}&type=entree`}>
            <ClipboardPlus className="h-4 w-4" />
            État des lieux entrée
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/inventaire/nouveau?villaId=${villa.id}&type=sortie`}>
            <ClipboardPlus className="h-4 w-4" />
            État des lieux sortie
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Réservations</CardTitle>
          <AddReservationDialog villaId={villa.id} />
        </CardHeader>
        <CardContent className="space-y-3">
          {villaReservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune réservation.</p>
          ) : (
            villaReservations.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.guestName}</p>
                    <Badge variant={r.source === "superhote" ? "secondary" : "outline"} className="mt-1">
                      {r.source === "superhote" ? "Superhote" : "Manuel"}
                    </Badge>
                  </div>
                  <ConfirmDeleteButton
                    action={deleteReservation.bind(null, r.id)}
                    title="Supprimer cette réservation ?"
                    description="Cette action est irréversible."
                  />
                </div>
                <ReservationDates checkIn={new Date(r.checkIn)} checkOut={new Date(r.checkOut)} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventaires</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun état des lieux pour cette villa.</p>
          ) : (
            checklists.map((c) => (
              <Link
                key={c.id}
                href={`/inventaire/${c.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:border-primary/50"
              >
                <div>
                  <p className="font-medium">{c.type === "entree" ? "État des lieux d'entrée" : "État des lieux de sortie"}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(c.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                  </p>
                </div>
                <Badge variant={c.status === "signe" ? "default" : "outline"}>
                  {c.status === "signe" ? "Signé" : "Brouillon"}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Identifiant Superhote (property_key) : {villa.superhoteListingId ?? "non renseigné"}
      </p>
    </div>
  );
}
