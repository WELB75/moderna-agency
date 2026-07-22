"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { createContactByOwner, addTechnicianAsContactByOwner } from "@/lib/actions/owner-contacts";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";

const ROLE_OPTIONS = Object.entries(CONTACT_ROLE_LABELS).filter(([key]) => key !== "proprietaire");

export type TechnicianOption = {
  id: string;
  nom: string;
  fonction: string;
  telephone: string;
};

export function AddOwnerContactDialog({
  villaId,
  technicians,
}: {
  villaId: string;
  technicians: TechnicianOption[];
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("autre");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [isPending, startTransition] = useTransition();

  function resetAndClose() {
    setOpen(false);
    setRole("autre");
    setNom("");
    setTelephone("");
  }

  function handleManualSubmit() {
    const formData = new FormData();
    formData.set("role", role);
    formData.set("nom", nom);
    formData.set("telephone", telephone);
    startTransition(async () => {
      try {
        await createContactByOwner(villaId, formData);
        toast.success("Contact ajouté.");
        resetAndClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handlePickTechnician(technicianId: string) {
    startTransition(async () => {
      try {
        await addTechnicianAsContactByOwner(villaId, technicianId);
        toast.success("Contact ajouté.");
        resetAndClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Ajouter quelqu&apos;un
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter à votre équipe</DialogTitle>
          <DialogDescription>Une personne qui travaille pour vous sur ce logement.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="liste">
          <TabsList className="w-full">
            <TabsTrigger value="liste" className="flex-1">
              Depuis la liste
            </TabsTrigger>
            <TabsTrigger value="manuel" className="flex-1">
              Nouveau contact
            </TabsTrigger>
          </TabsList>

          <TabsContent value="liste" className="space-y-2 pt-2">
            {technicians.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun prestataire connu pour l&apos;instant.</p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {technicians.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handlePickTechnician(t.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-2.5 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{t.nom}</span>
                      <span className="text-muted-foreground"> · {t.fonction}</span>
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manuel" className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-contact-nom">Nom</Label>
              <Input id="owner-contact-nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-contact-tel">Téléphone</Label>
              <Input
                id="owner-contact-tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                type="tel"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={isPending || !nom.trim()}
                onClick={handleManualSubmit}
                className="w-full sm:w-auto"
              >
                {isPending ? "Ajout..." : "Ajouter"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
