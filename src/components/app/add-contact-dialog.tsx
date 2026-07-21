"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
import { createContact } from "@/lib/actions/contacts";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";

export type ExistingContact = { nom: string; telephone: string | null; role: string };

export function AddContactDialog({
  villaId,
  domaineId,
  domaineNom,
  existingContacts = [],
}: {
  villaId?: string;
  domaineId?: string | null;
  domaineNom?: string | null;
  existingContacts?: ExistingContact[];
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [scope, setScope] = useState<"villa" | "domaine">("villa");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [paiementRecurrent, setPaiementRecurrent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Déduplique par nom (insensible à la casse) pour la suggestion.
  const uniqueExisting = Array.from(
    new Map(existingContacts.map((c) => [c.nom.trim().toLowerCase(), c])).values()
  );

  function handleNomChange(value: string) {
    setNom(value);
    const match = uniqueExisting.find((c) => c.nom.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) {
      if (match.telephone) setTelephone(match.telephone);
      if (match.role) setRole(match.role);
    }
  }

  async function handleSubmit(formData: FormData) {
    formData.set("role", role);
    formData.set("nom", nom);
    formData.set("telephone", telephone);
    formData.set("villaId", scope === "villa" ? villaId ?? "" : "");
    formData.set("domaineId", scope === "domaine" ? domaineId ?? "" : "");
    if (paiementRecurrent) formData.set("paiementRecurrent", "on");

    startTransition(async () => {
      try {
        await createContact(formData);
        toast.success("Contact ajouté.");
        setOpen(false);
        setRole("");
        setNom("");
        setTelephone("");
        setPaiementRecurrent(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Ajouter un contact
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
          <DialogDescription>Propriétaire, femme de ménage, jardinier, pisciniste...</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {domaineId ? (
            <div className="space-y-1.5">
              <Label>S&apos;applique à</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "villa" | "domaine")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {villaId ? <SelectItem value="villa">Cette villa uniquement</SelectItem> : null}
                  <SelectItem value="domaine">Tout le domaine{domaineNom ? ` (${domaineNom})` : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={setRole} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONTACT_ROLE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nom">Nom</Label>
            <Input
              id="nom"
              value={nom}
              onChange={(e) => handleNomChange(e.target.value)}
              list="existing-contacts-datalist"
              placeholder="Tape ou choisis un contact déjà enregistré"
              required
            />
            <datalist id="existing-contacts-datalist">
              {uniqueExisting.map((c) => (
                <option key={c.nom} value={c.nom}>
                  {CONTACT_ROLE_LABELS[c.role] ?? c.role}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input
              id="telephone"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Ex. 0661757246"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="paiementRecurrent"
              checked={paiementRecurrent}
              onCheckedChange={(v) => setPaiementRecurrent(v === true)}
            />
            <Label htmlFor="paiementRecurrent" className="font-normal">
              Personnel payé régulièrement (rappel de paiement mensuel)
            </Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !role} className="w-full sm:w-auto">
              {isPending ? "Ajout..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
