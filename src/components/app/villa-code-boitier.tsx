"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, DoorClosedLocked, Pencil, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateVillaCodeBoitier, updateVillaCodePorteEntree } from "@/lib/actions/villas";

// Certaines villas ont deux codes distincts (boîte à clés ET porte d'entrée) : un même
// composant générique pour les deux, chacun relié à sa propre action serveur.
function VillaCodeField({
  villaId,
  fieldName,
  label,
  dialogDescription,
  placeholder,
  value,
  action,
  icon: Icon,
}: {
  villaId: string;
  fieldName: string;
  label: string;
  dialogDescription: string;
  placeholder: string;
  value: string | null;
  action: (formData: FormData) => Promise<void>;
  icon: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await action(formData);
        toast.success("Code mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tracking-wider">{value ?? "Non renseigné"}</p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={fieldName}>Code</Label>
              <Input id={fieldName} name={fieldName} defaultValue={value ?? ""} placeholder={placeholder} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VillaCodeBoitier({ villaId, codeBoitier }: { villaId: string; codeBoitier: string | null }) {
  return (
    <VillaCodeField
      villaId={villaId}
      fieldName="codeBoitier"
      label="Code du boîtier à clés"
      dialogDescription="Code d'accès à la boîte à clés / au digicode de la villa."
      placeholder="Ex. 1526"
      value={codeBoitier}
      action={updateVillaCodeBoitier}
      icon={KeyRound}
    />
  );
}

export function VillaCodePorteEntree({ villaId, codePorteEntree }: { villaId: string; codePorteEntree: string | null }) {
  return (
    <VillaCodeField
      villaId={villaId}
      fieldName="codePorteEntree"
      label="Code de la porte d'entrée"
      dialogDescription="Code de la poignée tactile de la porte d'entrée de la villa (distinct du boîtier à clés)."
      placeholder="Ex. 082421#"
      value={codePorteEntree}
      action={updateVillaCodePorteEntree}
      icon={DoorClosedLocked}
    />
  );
}
