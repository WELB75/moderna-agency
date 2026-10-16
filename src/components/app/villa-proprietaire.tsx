"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { User, Pencil } from "lucide-react";
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
import { PhoneLink } from "@/components/app/phone-link";
import { updateVillaProprietaire } from "@/lib/actions/villas";

export function VillaProprietaire({
  villaId,
  proprietaireNom,
  proprietaireTelephone,
}: {
  villaId: string;
  proprietaireNom: string | null;
  proprietaireTelephone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaProprietaire(formData);
        toast.success("Propriétaire mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Propriétaire</p>
          <p className="break-words font-semibold">{proprietaireNom ?? "Non renseigné"}</p>
          {proprietaireTelephone ? <PhoneLink phone={proprietaireTelephone} className="mt-1" /> : null}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="size-10 shrink-0 md:size-auto md:h-7">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propriétaire</DialogTitle>
            <DialogDescription>Nom et téléphone du propriétaire de ce logement.</DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="proprietaireNom">Nom</Label>
              <Input
                id="proprietaireNom"
                name="proprietaireNom"
                defaultValue={proprietaireNom ?? ""}
                placeholder="Ex. Mme Sara"
                className="h-11 md:h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proprietaireTelephone">Téléphone</Label>
              <Input
                id="proprietaireTelephone"
                name="proprietaireTelephone"
                defaultValue={proprietaireTelephone ?? ""}
                placeholder="Ex. 0638907325"
                className="h-11 md:h-8"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="h-11 w-full sm:w-auto md:h-8">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
