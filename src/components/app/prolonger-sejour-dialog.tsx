"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
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
import { prolongerSejour } from "@/lib/actions/prolongation";

function jourSuivant(d: Date): string {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return n.toISOString().slice(0, 10);
}

export function ProlongerSejourDialog({ reservationId, checkOut, onDone }: { reservationId: string; checkOut: Date; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const minDepart = jourSuivant(checkOut);
  const [depart, setDepart] = useState(minDepart);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await prolongerSejour(reservationId, depart);
        if (res.beds24Statut === "echec") {
          toast.error(`Séjour prolongé, mais le calendrier n'a PAS pu être bloqué : ${res.beds24Detail}`);
        } else {
          toast.success(res.beds24Statut === "ok" ? "Séjour prolongé, calendrier bloqué sur Airbnb et Booking.com." : `Séjour prolongé. ${res.beds24Detail}`);
        }
        if (res.menageAChecker) {
          toast.message("Le ménage prévu au départ initial est à retirer, un nouveau ménage est demandé pour le nouveau départ.");
        }
        setOpen(false);
        onDone?.();
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
          <CalendarPlus className="h-3 w-3" />
          Prolonger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prolonger le séjour</DialogTitle>
          <DialogDescription>
            Les nuits ajoutées sont vérifiées libres puis fermées dans le calendrier (Airbnb et Booking.com), pour éviter toute double
            réservation. Pour un client venu d&apos;Airbnb ou Booking.com, la prolongation est enregistrée comme une réservation en direct : la
            réservation de la plateforme n&apos;est pas modifiée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Nouveau jour de départ</Label>
          <Input type="date" min={minDepart} value={depart} onChange={(e) => setDepart(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending || !depart} onClick={handleSave} className="w-full sm:w-auto">
            {isPending ? "Vérification..." : "Prolonger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
