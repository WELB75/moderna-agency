"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPersonnel } from "@/lib/actions/personnel";

export function AddPersonnelDialog({ defaultRole }: { defaultRole?: "menage" | "cuisine" }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(defaultRole ?? "menage");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("role", role);
    startTransition(async () => {
      try {
        await createPersonnel(formData);
        toast.success("Ajouté à l'équipe.");
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
          Ajouter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle personne</DialogTitle>
          <DialogDescription>Femme de ménage ou cuisinière à affecter aux villas.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nom">Prénom / nom</Label>
            <Input id="nom" name="nom" placeholder="Ex. Touria" required />
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "menage" | "cuisine")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menage">Femme de ménage</SelectItem>
                <SelectItem value="cuisine">Cuisinière</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input id="telephone" name="telephone" type="tel" placeholder="06 XX XX XX XX" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Optionnel" />
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
