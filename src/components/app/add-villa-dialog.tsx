"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createVilla } from "@/lib/actions/villas";

export function AddVillaDialog({
  domaines,
  type = "villa",
}: {
  domaines: { id: string; nom: string }[];
  type?: "villa" | "appartement";
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isAppartement = type === "appartement";

  async function handleSubmit(formData: FormData) {
    formData.set("type", type);
    startTransition(async () => {
      try {
        await createVilla(formData);
        toast.success(isAppartement ? "Appartement ajouté." : "Villa ajoutée.");
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
          {isAppartement ? "Nouvel appartement" : "Nouvelle villa"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAppartement ? "Nouvel appartement" : "Nouvelle villa"}</DialogTitle>
          <DialogDescription>
            {isAppartement
              ? "Chaque appartement a un numéro et un nom qui lui sont propres."
              : "Chaque villa a un numéro et un nom qui lui sont propres."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domaineId">Domaine</Label>
            <Select name="domaineId">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Aucun / sélectionner un domaine" />
              </SelectTrigger>
              <SelectContent>
                {domaines.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="numero">Numéro</Label>
              <Input id="numero" name="numero" placeholder="Ex. 12" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                name="nom"
                placeholder={isAppartement ? "Ex. Appartement Zen" : "Ex. Villa Corail"}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adresse">Adresse</Label>
            <Input id="adresse" name="adresse" placeholder="Adresse complète" />
          </div>
          {isAppartement && (
            <div className="space-y-1.5">
              <Label htmlFor="numeroImmeuble">Numéro de l&apos;immeuble</Label>
              <Input id="numeroImmeuble" name="numeroImmeuble" placeholder="Ex. Immeuble B" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="codeBoitier">Code du boîtier à clés</Label>
            <Input id="codeBoitier" name="codeBoitier" placeholder="Ex. 1526" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="superhoteListingId">
              Identifiant Superhote (property_key)
            </Label>
            <Input id="superhoteListingId" name="superhoteListingId" placeholder="Optionnel" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Ajout..." : isAppartement ? "Ajouter l'appartement" : "Ajouter la villa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
