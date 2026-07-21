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
import { createInterventionByOwner } from "@/lib/actions/interventions";

export function AddTravauxRequestDialog({ villaId }: { villaId: string }) {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState("");
  const [probleme, setProbleme] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createInterventionByOwner(villaId, titre, probleme);
        toast.success("Demande envoyée.");
        setOpen(false);
        setTitre("");
        setProbleme("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Demander un travaux
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle demande</DialogTitle>
          <DialogDescription>Décrivez ce qui doit être réparé ou fait dans le logement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titre">Titre</Label>
            <Input
              id="titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex. Climatisation en panne"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="probleme">Détails</Label>
            <Textarea
              id="probleme"
              value={probleme}
              onChange={(e) => setProbleme(e.target.value)}
              rows={3}
              placeholder="Décrivez le problème ou ce que vous souhaitez faire faire..."
            />
          </div>
          <DialogFooter>
            <Button type="button" disabled={isPending || !titre.trim()} onClick={handleSubmit} className="w-full sm:w-auto">
              {isPending ? "Envoi..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
