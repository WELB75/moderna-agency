"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [indicatif, setIndicatif] = useState("+212");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [isPending, startTransition] = useTransition();

  function composePhone() {
    if (indicatif === "autre") return phoneLocal.trim();
    const digits = phoneLocal.trim().replace(/^0+/, "");
    return digits ? `${indicatif}${digits}` : "";
  }

  async function handleSubmit(formData: FormData) {
    formData.set("guestPhone", composePhone());
    startTransition(async () => {
      try {
        await createReservation(formData);
        toast.success("Réservation ajoutée.");
        setOpen(false);
        setPhoneLocal("");
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
            <div className="flex gap-2">
              <Select value={indicatif} onValueChange={setIndicatif}>
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+212">🇲🇦 +212</SelectItem>
                  <SelectItem value="+33">🇫🇷 +33</SelectItem>
                  <SelectItem value="+34">🇪🇸 +34</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="guestPhone"
                value={phoneLocal}
                onChange={(e) => setPhoneLocal(e.target.value)}
                placeholder={indicatif === "autre" ? "Numéro complet avec indicatif" : "Ex. 0661757246"}
              />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nbAdultes">Adultes</Label>
              <Input id="nbAdultes" name="nbAdultes" type="number" min="0" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nbEnfants">Enfants</Label>
              <Input id="nbEnfants" name="nbEnfants" type="number" min="0" placeholder="0" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Le nombre d&apos;adultes sert pour la fiche gendarmerie (les enfants n&apos;y figurent pas).
          </p>
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
