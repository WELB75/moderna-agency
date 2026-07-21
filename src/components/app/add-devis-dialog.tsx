"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X, FileText } from "lucide-react";
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
import { addDevis } from "@/lib/actions/interventions";
import { emptyDevis, type Devis } from "@/lib/devis-types";

export function AddDevisDialog({ interventionId }: { interventionId: string }) {
  const [open, setOpen] = useState(false);
  const [devis, setDevis] = useState<Devis>(emptyDevis());
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof Devis>(key: K, value: Devis[K]) {
    setDevis((prev) => ({ ...prev, [key]: value }));
  }

  function updateLigne(index: number, key: "description" | "prix", value: string) {
    setDevis((prev) => ({
      ...prev,
      lignes: prev.lignes.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    }));
  }

  function handleSubmit() {
    if (!devis.titre.trim()) {
      toast.error("Le titre du devis est obligatoire.");
      return;
    }
    startTransition(async () => {
      try {
        await addDevis(interventionId, { ...devis, createdAt: new Date().toISOString() });
        toast.success("Devis ajouté.");
        setOpen(false);
        setDevis(emptyDevis());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FileText className="h-3.5 w-3.5" />
          Ajouter un devis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau devis</DialogTitle>
          <DialogDescription>Rempli ligne par ligne, à envoyer pour validation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Titre</Label>
            <Input
              value={devis.titre}
              onChange={(e) => update("titre", e.target.value)}
              placeholder="Ex. Devis - Marrakech Auxiliaire"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prestataire</Label>
              <Input value={devis.prestataireNom} onChange={(e) => update("prestataireNom", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input
                value={devis.prestataireTelephone}
                onChange={(e) => update("prestataireTelephone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Site web</Label>
              <Input value={devis.prestataireSite} onChange={(e) => update("prestataireSite", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={devis.prestataireEmail} onChange={(e) => update("prestataireEmail", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input
                value={devis.prestataireInstagram}
                onChange={(e) => update("prestataireInstagram", e.target.value)}
                placeholder="@m_auxiliaire"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Facebook</Label>
              <Input
                value={devis.prestataireFacebook}
                onChange={(e) => update("prestataireFacebook", e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Adresse</Label>
              <Input
                value={devis.prestataireAdresse}
                onChange={(e) => update("prestataireAdresse", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lignes du devis</Label>
            {devis.lignes.map((ligne, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={ligne.description}
                  onChange={(e) => updateLigne(i, "description", e.target.value)}
                  placeholder="Description"
                  className="flex-1"
                />
                <Input
                  value={ligne.prix}
                  onChange={(e) => updateLigne(i, "prix", e.target.value)}
                  placeholder="Prix"
                  className="w-24"
                />
                {devis.lignes.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDevis((prev) => ({ ...prev, lignes: prev.lignes.filter((_, j) => j !== i) }))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDevis((prev) => ({ ...prev, lignes: [...prev.lignes, { description: "", prix: "" }] }))}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une ligne
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Devise</Label>
              <Input value={devis.devise} onChange={(e) => update("devise", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total (si différent de la somme)</Label>
              <Input
                value={devis.totalOverride}
                onChange={(e) => update("totalOverride", e.target.value)}
                placeholder="Ex. 1200 DH par commune"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={devis.note} onChange={(e) => update("note", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending} onClick={handleSubmit} className="w-full sm:w-auto">
            {isPending ? "Ajout..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
