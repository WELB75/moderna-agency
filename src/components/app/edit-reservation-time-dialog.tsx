"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { updateReservationTimes } from "@/lib/actions/reservations";
import { formatUtcTime } from "@/lib/now";

export function EditReservationTimeDialog({
  reservationId,
  checkIn,
  checkOut,
}: {
  reservationId: string;
  checkIn: Date;
  checkOut: Date;
}) {
  const [open, setOpen] = useState(false);
  const [checkInTime, setCheckInTime] = useState(formatUtcTime(checkIn));
  const [checkOutTime, setCheckOutTime] = useState(formatUtcTime(checkOut));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateReservationTimes(reservationId, checkInTime, checkOutTime);
        toast.success("Heures mises à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="h-3 w-3" />
          Corriger l&apos;heure
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corriger les heures</DialogTitle>
          <DialogDescription>
            Superhote n&apos;indique pas toujours l&apos;heure exacte (surtout via Booking.com) : une
            heure par défaut est utilisée. Corrige-la ici si tu connais l&apos;heure réelle.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Heure de check-in</Label>
            <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Heure de check-out</Label>
            <Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending} onClick={handleSave} className="w-full sm:w-auto">
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
