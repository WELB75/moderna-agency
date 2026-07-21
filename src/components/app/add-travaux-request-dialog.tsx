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
import { createInterventionByOwner } from "@/lib/actions/interventions";
import type { Urgence } from "@/lib/intervention-urgence";

const OWNER_URGENCE_OPTIONS: { key: Urgence; label: string }[] = [
  { key: "basse", label: "Pas pressé" },
  { key: "normale", label: "Normal" },
  { key: "haute", label: "Urgent" },
  { key: "critique", label: "Très urgent — à traiter vite" },
];

export function AddTravauxRequestDialog({ villaId }: { villaId: string }) {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState("");
  const [probleme, setProbleme] = useState("");
  const [urgence, setUrgence] = useState<Urgence>("normale");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createInterventionByOwner(villaId, titre, probleme, urgence);
        toast.success("Demande envoyée.");
        setOpen(false);
        setTitre("");
        setProbleme("");
        setUrgence("normale");
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
          <div className="space-y-1.5">
            <Label>À quel point c&apos;est urgent pour vous ?</Label>
            <Select value={urgence} onValueChange={(v) => setUrgence(v as Urgence)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OWNER_URGENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
