"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil } from "lucide-react";
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
import { updateVillaCodeBoitier } from "@/lib/actions/villas";

export function VillaCodeBoitier({
  villaId,
  codeBoitier,
}: {
  villaId: string;
  codeBoitier: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaCodeBoitier(formData);
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
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Code du boîtier à clés</p>
          <p className="text-lg font-semibold tracking-wider">{codeBoitier ?? "Non renseigné"}</p>
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
            <DialogTitle>Code du boîtier</DialogTitle>
            <DialogDescription>Code d&apos;accès à la boîte à clés / au digicode de la villa.</DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="codeBoitier">Code</Label>
              <Input id="codeBoitier" name="codeBoitier" defaultValue={codeBoitier ?? ""} placeholder="Ex. 1526" />
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
