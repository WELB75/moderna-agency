"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { updateDomaineLocation } from "@/lib/actions/domaines";

export function DomaineLocation({
  domaineId,
  mapsUrl,
}: {
  domaineId: string;
  mapsUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(mapsUrl ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateDomaineLocation(domaineId, value);
        toast.success("Localisation enregistrée.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      {mapsUrl ? (
        <Badge asChild variant="outline" className="cursor-pointer">
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Localisation
          </a>
        </Badge>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Localisation du domaine</DialogTitle>
            <DialogDescription>
              Colle un lien Google Maps (ouvre l&apos;app, appuie sur &laquo; Partager &raquo;, copie le lien).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mapsUrl">Lien Google Maps</Label>
              <Input
                id="mapsUrl"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>
            <DialogFooter>
              <Button type="button" disabled={isPending} onClick={handleSave} className="w-full sm:w-auto">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
