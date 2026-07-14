"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createReservation } from "@/lib/actions/reservations";

export function AddReservationDialog({ villaId }: { villaId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createReservation(formData);
        toast.success("Réservation ajoutée.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Réservation manuelle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une réservation</DialogTitle>
          <DialogDescription>
            Pour les réservations qui ne viennent pas de Superhote.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="villaId" value={villaId} />
          <div className="space-y-1.5">
            <Label htmlFor="guestName">Nom du client</Label>
            <Input id="guestName" name="guestName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guestPhone">Téléphone</Label>
            <Input id="guestPhone" name="guestPhone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="checkIn">Arrivée</Label>
              <Input id="checkIn" name="checkIn" type="datetime-local" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkOut">Départ</Label>
              <Input id="checkOut" name="checkOut" type="datetime-local" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guestsCount">Nombre de voyageurs</Label>
            <Input id="guestsCount" name="guestsCount" type="number" min="1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Demandes particulières</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Ex. Prévoir une cuisinière" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Ajout..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
