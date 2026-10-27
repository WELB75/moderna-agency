"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { updateVillaBaseConnaissances } from "@/lib/actions/villas";

// Fiche lue par l'agent IA de la boîte Airbnb / Booking.com pour répondre sur CETTE villa.
// Pas de code ni de prix ici : les codes ont leurs champs, et l'agent a ses propres règles.
export function VillaBaseConnaissances({ villaId, baseConnaissances }: { villaId: string; baseConnaissances: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaBaseConnaissances(formData);
        toast.success("Fiche de l'agent IA mise à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border bg-card p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Fiche de l&apos;agent IA (messages Airbnb / Booking.com)</p>
            <p className="text-sm font-medium">{baseConnaissances ? `${baseConnaissances.trim().length} caractères` : "Non renseignée"}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="size-10 shrink-0 md:size-auto md:h-7">
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Fiche de l&apos;agent IA</DialogTitle>
              <DialogDescription>
                Ce que l&apos;agent sait de cette villa : couchages, équipements, piscine, hammam, accès, règlement, distances. Pas de code
                ni de prix ici : les codes ont leurs champs, la caution, le ménage et la cuisinière sont gérés par l&apos;agent.
              </DialogDescription>
            </DialogHeader>
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="baseConnaissances">Fiche</Label>
                <Textarea id="baseConnaissances" name="baseConnaissances" defaultValue={baseConnaissances ?? ""} rows={18} className="font-mono text-xs" />
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
    </div>
  );
}
