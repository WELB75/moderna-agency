"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { updateVillaInfo } from "@/lib/actions/villas";

export function EditVillaInfoDialog({
  villaId,
  numero,
  nom,
  adresse,
  numeroImmeuble,
  domaineId,
  domaines,
  portailAuteurs,
  notes,
  personnelPayeParProprietaire,
  typeLabel = "Villa",
}: {
  villaId: string;
  numero: string;
  nom: string;
  adresse: string | null;
  numeroImmeuble?: string | null;
  domaineId: string | null;
  domaines: { id: string; nom: string }[];
  portailAuteurs?: string[] | null;
  notes?: string | null;
  personnelPayeParProprietaire?: boolean;
  typeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDomaine, setSelectedDomaine] = useState(domaineId ?? "");
  const [payeParProprietaire, setPayeParProprietaire] = useState(personnelPayeParProprietaire ?? false);
  const [isPending, startTransition] = useTransition();
  const isAppartement = typeLabel === "Appartement";

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    formData.set("domaineId", selectedDomaine);
    if (payeParProprietaire) formData.set("personnelPayeParProprietaire", "on");
    startTransition(async () => {
      try {
        await updateVillaInfo(formData);
        toast.success("Informations mises à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Informations {typeLabel === "Appartement" ? "de l'appartement" : "de la villa"}</DialogTitle>
          <DialogDescription>Numéro, nom, adresse et domaine.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Domaine</Label>
            <Select value={selectedDomaine} onValueChange={setSelectedDomaine}>
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
              <Input id="numero" name="numero" defaultValue={numero} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" name="nom" defaultValue={nom} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adresse">Adresse (ou lien Google Maps si pas d&apos;adresse précise)</Label>
            <Input id="adresse" name="adresse" defaultValue={adresse ?? ""} placeholder="Ex. https://maps.app.goo.gl/..." />
          </div>
          {isAppartement && (
            <div className="space-y-1.5">
              <Label htmlFor="numeroImmeuble">Numéro de l&apos;immeuble</Label>
              <Input
                id="numeroImmeuble"
                name="numeroImmeuble"
                defaultValue={numeroImmeuble ?? ""}
                placeholder="Ex. Immeuble B"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="portailAuteurs">Prénoms autorisés à écrire depuis l&apos;espace propriétaire</Label>
            <Input
              id="portailAuteurs"
              name="portailAuteurs"
              defaultValue={(portailAuteurs ?? []).join(", ")}
              placeholder="Ex. Lila, Kamel, Mustapha"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes internes (ex. qui gère le ménage/la cuisine ici)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={notes ?? ""}
              placeholder="Ex. Ménage/cuisine gérés par Aisha directement, payée par le propriétaire."
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              id="personnelPayeParProprietaire"
              checked={payeParProprietaire}
              onCheckedChange={(v) => setPayeParProprietaire(v === true)}
            />
            <Label htmlFor="personnelPayeParProprietaire" className="font-normal">
              Ménage/cuisine payés directement par le propriétaire — masque les montants et
              désactive le paiement via le système pour cette villa
            </Label>
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
