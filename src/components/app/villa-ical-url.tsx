"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarSync, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateVillaIcalUrl, updateVillaDirectIcalUrls } from "@/lib/actions/villas";

export function VillaIcalUrl({ villaId, icalUrl }: { villaId: string; icalUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaIcalUrl(formData);
        toast.success("Lien iCal mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <CalendarSync className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Synchro calendrier (iCal Superhote, legacy)</p>
          <p className="truncate text-sm font-medium">{icalUrl ?? "Non configuré"}</p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien iCal</DialogTitle>
            <DialogDescription>
              Dans Superhote : Calendriers → cette villa → « Synchroniser / Exporter le calendrier ». Colle le lien qui se termine par .ics.
            </DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="icalUrl">Lien iCal</Label>
              <Input
                id="icalUrl"
                name="icalUrl"
                defaultValue={icalUrl ?? ""}
                placeholder="https://.../calendar.ics"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Synchro directe Airbnb/Booking.com — sans channel manager. Deux liens à récupérer (import) et
// deux liens à donner (export), voir runDirectPlatformSync / api/ical/export/[villaId].
export function VillaDirectIcalUrls({
  villaId,
  airbnbIcalUrl,
  bookingIcalUrl,
}: {
  villaId: string;
  airbnbIcalUrl: string | null;
  bookingIcalUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const exportAirbnb = `${origin}/api/ical/export/${villaId}?for=airbnb`;
  const exportBooking = `${origin}/api/ical/export/${villaId}?for=booking`;

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaDirectIcalUrls(formData);
        toast.success("Liens Airbnb/Booking.com mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <CalendarSync className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Synchro directe Airbnb / Booking.com (sans channel manager)</p>
          <p className="truncate text-sm font-medium">
            Airbnb : {airbnbIcalUrl ?? "Non configuré"} · Booking.com : {bookingIcalUrl ?? "Non configuré"}
          </p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liens Airbnb / Booking.com</DialogTitle>
            <DialogDescription>
              À récupérer depuis les paramètres de synchronisation calendrier de chaque plateforme (annonce → Disponibilité →
              Synchroniser les calendriers), et à leur donner en retour l&apos;export ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="airbnbIcalUrl">Lien iCal Airbnb (import)</Label>
              <Input
                id="airbnbIcalUrl"
                name="airbnbIcalUrl"
                defaultValue={airbnbIcalUrl ?? ""}
                placeholder="https://www.airbnb.com/calendar/ical/....ics"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bookingIcalUrl">Lien iCal Booking.com (import)</Label>
              <Input
                id="bookingIcalUrl"
                name="bookingIcalUrl"
                defaultValue={bookingIcalUrl ?? ""}
                placeholder="https://admin.booking.com/.../ical.ics"
              />
            </div>
            <div className="space-y-1.5 rounded-md bg-muted/50 p-3 text-xs">
              <p className="font-medium text-foreground">À coller côté Airbnb (Importer un calendrier) :</p>
              <p className="break-all font-mono">{exportAirbnb}</p>
              <p className="mt-2 font-medium text-foreground">À coller côté Booking.com :</p>
              <p className="break-all font-mono">{exportBooking}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
