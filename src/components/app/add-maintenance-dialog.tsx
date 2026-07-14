"use client";

import { useMemo, useState, useTransition } from "react";
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
import { createMaintenanceRecord } from "@/lib/actions/maintenance";
import { MAINTENANCE_CATEGORIES } from "@/lib/maintenance-defaults";

export function AddMaintenanceDialog({
  villas,
  technicians = [],
  defaultVillaId,
}: {
  villas: { id: string; nom: string; numero: string }[];
  technicians?: { id: string; nom: string; fonction: string }[];
  defaultVillaId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [villaId, setVillaId] = useState(defaultVillaId ?? "");
  const [categorie, setCategorie] = useState("");
  const [isPending, startTransition] = useTransition();

  const equipementSuggestions = useMemo(
    () => MAINTENANCE_CATEGORIES.find((c) => c.categorie === categorie)?.equipements ?? [],
    [categorie]
  );

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    formData.set("categorie", categorie);
    startTransition(async () => {
      try {
        await createMaintenanceRecord(formData);
        toast.success("Entretien enregistré.");
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
          Nouvel entretien
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel entretien</DialogTitle>
          <DialogDescription>Enregistre une révision ou une intervention de maintenance.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {!defaultVillaId && (
            <div className="space-y-1.5">
              <Label>Villa</Label>
              <Select value={villaId} onValueChange={setVillaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner une villa" />
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
          )}

          <div className="space-y-1.5">
            <Label>Catégorie</Label>
            <Select value={categorie} onValueChange={setCategorie}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <SelectItem key={c.categorie} value={c.categorie}>
                    {c.categorie}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="equipement">Équipement</Label>
            <Input
              id="equipement"
              name="equipement"
              list="equipement-suggestions"
              placeholder="Ex. Piscine - Moteur / pompe"
              required
            />
            <datalist id="equipement-suggestions">
              {equipementSuggestions.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dateIntervention">Date de l&apos;intervention</Label>
              <Input id="dateIntervention" name="dateIntervention" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prochaineDatePrevue">Prochaine échéance</Label>
              <Input id="prochaineDatePrevue" name="prochaineDatePrevue" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prestataire">Prestataire</Label>
              <Input
                id="prestataire"
                name="prestataire"
                list="prestataire-suggestions"
                placeholder="Entreprise / technicien"
              />
              <datalist id="prestataire-suggestions">
                {technicians.map((t) => (
                  <option key={t.id} value={t.nom}>
                    {t.fonction}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cout">Coût (DH)</Label>
              <Input id="cout" name="cout" type="number" step="0.01" min="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
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
