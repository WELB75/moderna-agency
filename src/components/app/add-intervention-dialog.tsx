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
import { createIntervention } from "@/lib/actions/interventions";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";

export function AddInterventionDialog({
  villas,
  domaines,
  technicians = [],
  contacts = [],
}: {
  villas: { id: string; nom: string; numero: string; domaineId: string | null }[];
  domaines: { id: string; nom: string }[];
  technicians?: { nom: string; fonction: string }[];
  contacts?: { villaId: string | null; domaineId: string | null; nom: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [villaId, setVillaId] = useState("");
  const [domaineId, setDomaineId] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedVillaDomaineId = villas.find((v) => v.id === villaId)?.domaineId ?? domaineId;
  // Priorise les contacts déjà rattachés à cette villa/ce domaine (jardinier, pisciniste...)
  // plutôt que la liste générale des prestataires.
  const relevantContacts = contacts.filter(
    (c) => (villaId && c.villaId === villaId) || (selectedVillaDomaineId && c.domaineId === selectedVillaDomaineId)
  );

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    formData.set("domaineId", domaineId);
    startTransition(async () => {
      try {
        await createIntervention(formData);
        toast.success("Intervention créée.");
        setOpen(false);
        setVillaId("");
        setDomaineId("");
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
          Nouvelle intervention
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle intervention</DialogTitle>
          <DialogDescription>Suivi d&apos;une intervention, étape par étape.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" placeholder="Ex. Électricien" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="probleme">Problème</Label>
            <Textarea id="probleme" name="probleme" rows={2} placeholder="Ex. Panne électrique dans l'appartement" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Domaine</Label>
              <Select value={domaineId} onValueChange={setDomaineId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optionnel" />
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
            <div className="space-y-1.5">
              <Label>Villa / appartement</Label>
              <Select value={villaId} onValueChange={setVillaId}>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lieu">Lieu (si pas une villa précise)</Label>
            <Input id="lieu" name="lieu" placeholder="Ex. Résidence Noria" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prestataire">Prestataire</Label>
            <Input
              id="prestataire"
              name="prestataire"
              list="intervention-prestataire-suggestions"
              placeholder="Ex. Mohamed (électricien)"
            />
            <datalist id="intervention-prestataire-suggestions">
              {relevantContacts.map((c) => (
                <option key={c.nom} value={c.nom}>
                  {CONTACT_ROLE_LABELS[c.role] ?? c.role}
                </option>
              ))}
              {technicians.map((t) => (
                <option key={t.nom} value={t.nom}>
                  {t.fonction}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Contexte, retard, suivi..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
