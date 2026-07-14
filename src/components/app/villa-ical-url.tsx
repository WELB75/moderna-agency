"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarSync, Pencil } from "lucide-react";
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
import { updateVillaIcalUrl } from "@/lib/actions/villas";

export function VillaIcalUrl({ villaId, icalUrl }: { villaId: string; icalUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    startTransition(async () => {
      try {
        await updateVillaIcalUrl(formData);
        toast.success("Lien iCal mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <CalendarSync className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Synchro calendrier (iCal Superhote)</p>
          <p className="truncate text-sm font-medium">{icalUrl ?? "Non configuré"}</p>
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
            <DialogTitle>Lien iCal</DialogTitle>
            <DialogDescription>
              Dans Superhote : Calendriers → cette villa → « Synchroniser / Exporter le calendrier ». Colle le lien qui se termine par .ics.
            </DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="icalUrl">Lien iCal</Label>
              <Input
                id="icalUrl"
                name="icalUrl"
                defaultValue={icalUrl ?? ""}
                placeholder="https://.../calendar.ics"
              />
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
