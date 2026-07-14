import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations, inventoryChecklists, maintenanceRecords, technicians, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AddReservationDialog } from "@/components/app/add-reservation-dialog";
import { AddMaintenanceDialog } from "@/components/app/add-maintenance-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ReservationDates } from "@/components/app/reservation-dates";
import { GuestCount } from "@/components/app/guest-count";
import { VillaPhotoUploader } from "@/components/app/villa-photo-uploader";
import { VillaCodeBoitier } from "@/components/app/villa-code-boitier";
import { VillaIcalUrl } from "@/components/app/villa-ical-url";
import { PaymentSummary, EditPaymentDialog } from "@/components/app/payment-info";
import { deleteVilla } from "@/lib/actions/villas";
import { deleteReservation } from "@/lib/actions/reservations";
import { deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import { ClipboardPlus, Info } from "lucide-react";

export default async function VillaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [villa] = await db
    .select({
      id: villas.id,
      numero: villas.numero,
      nom: villas.nom,
      adresse: villas.adresse,
      notes: villas.notes,
      description: villas.description,
      photoUrl: villas.photoUrl,
      galleryUrls: villas.galleryUrls,
      codeBoitier: villas.codeBoitier,
      icalUrl: villas.icalUrl,
      superhoteListingId: villas.superhoteListingId,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(villas.id, id))
    .limit(1);
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

  const villaMaintenance = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.villaId, id))
    .orderBy(desc(maintenanceRecords.dateIntervention));

  const allTechnicians = await db.select().from(technicians).orderBy(technicians.nom);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {villa.domaineNom ? (
            <p className="text-sm text-muted-foreground">{villa.domaineNom}</p>
          ) : null}
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

      <VillaCodeBoitier villaId={villa.id} codeBoitier={villa.codeBoitier} />

      <VillaIcalUrl villaId={villa.id} icalUrl={villa.icalUrl} />

      <VillaPhotoUploader villaId={villa.id} photoUrl={villa.photoUrl} />

      {villa.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{villa.description}</p>
          </CardContent>
        </Card>
      ) : null}

      {villa.galleryUrls && villa.galleryUrls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Galerie photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {villa.galleryUrls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-md border">
                  <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                  <div className="flex items-center gap-1">
                    <EditPaymentDialog
                      reservationId={r.id}
                      loyerTotal={r.loyerTotal}
                      montantPaye={r.montantPaye}
                      caution={r.caution}
                      cautionPayee={r.cautionPayee}
                      devisePaiement={r.devisePaiement}
                      moyenPaiement={r.moyenPaiement}
                      notesPaiement={r.notesPaiement}
                    />
                    <ConfirmDeleteButton
                      action={deleteReservation.bind(null, r.id)}
                      title="Supprimer cette réservation ?"
                      description="Cette action est irréversible."
                    />
                  </div>
                </div>
                <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />
                <ReservationDates checkIn={new Date(r.checkIn)} checkOut={new Date(r.checkOut)} />
                {r.notes ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{r.notes}</span>
                  </div>
                ) : null}
                <div className="mt-2">
                  <PaymentSummary
                    loyerTotal={r.loyerTotal}
                    montantPaye={r.montantPaye}
                    caution={r.caution}
                    cautionPayee={r.cautionPayee}
                    devisePaiement={r.devisePaiement}
                  />
                </div>
                {r.notesPaiement ? (
                  <p className="mt-1 text-xs text-muted-foreground">{r.notesPaiement}</p>
                ) : null}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Maintenance</CardTitle>
          <AddMaintenanceDialog villas={[villa]} technicians={allTechnicians} defaultVillaId={villa.id} />
        </CardHeader>
        <CardContent className="space-y-2">
          {villaMaintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun entretien enregistré.</p>
          ) : (
            villaMaintenance.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{m.categorie}</Badge>
                      <p className="font-medium">{m.equipement}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(m.dateIntervention), "d MMM yyyy", { locale: fr })}
                      {m.prestataire ? ` · ${m.prestataire}` : ""}
                      {m.cout ? ` · ${Number(m.cout).toFixed(2)} DH` : ""}
                    </p>
                    {m.prochaineDatePrevue ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Prochaine échéance :{" "}
                        {format(new Date(m.prochaineDatePrevue), "d MMM yyyy", { locale: fr })}
                      </p>
                    ) : null}
                  </div>
                  <ConfirmDeleteButton
                    action={deleteMaintenanceRecord.bind(null, m.id)}
                    title="Supprimer cet entretien ?"
                    description="Cette action est irréversible."
                  />
                </div>
              </div>
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
