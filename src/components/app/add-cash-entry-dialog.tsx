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
import { createCashEntry } from "@/lib/actions/caisse";

const MOYEN_LABELS: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement bancaire",
  carte: "Carte bleue",
};

export function AddCashEntryDialog({
  villas,
  moyenPaiement = "especes",
}: {
  villas: { id: string; nom: string; numero: string }[];
  moyenPaiement?: "especes" | "virement" | "carte";
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("remise");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("type", type);
    formData.set("moyenPaiement", moyenPaiement);
    startTransition(async () => {
      try {
        await createCashEntry(formData);
        toast.success("Mouvement enregistré.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Mouvement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau mouvement · {MOYEN_LABELS[moyenPaiement]}</DialogTitle>
          <DialogDescription>Enregistre l&apos;argent confié, dépensé ou restitué.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type de mouvement</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remise">Argent confié (remise)</SelectItem>
                <SelectItem value="depense">Dépense</SelectItem>
                <SelectItem value="restitution">Restitution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="montant">Montant (DH)</Label>
            <Input id="montant" name="montant" type="number" step="0.01" min="0" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="villaId">Villa concernée</Label>
            <Select name="villaId">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Optionnel" />
              </SelectTrigger>
              <SelectContent>
                {villas.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nom} (n°{v.numero})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="responsable">Personne concernée</Label>
            <Input
              id="responsable"
              name="responsable"
              placeholder="Ex. Brahim Jardinier"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Ex. courses ménage villa 12" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
