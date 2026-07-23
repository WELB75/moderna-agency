"use client";

import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importSuperhoteCsv } from "@/lib/actions/reservations";

export function ImportSuperhoteCsvDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleImport() {
    if (!file) return;
    startTransition(async () => {
      try {
        const text = await file.text();
        const result = await importSuperhoteCsv(text);
        if (result.matched > 0) {
          toast.success(`${result.matched} réservation(s) mise(s) à jour (loyer / montant payé).`);
        }
        if (result.unmatchedCount > 0) {
          toast.warning(
            `${result.unmatchedCount} ligne(s) du fichier non retrouvée(s) dans l'app` +
              (result.unmatched.length > 0 ? ` : ${result.unmatched.join(", ")}` : "") +
              "."
          );
        }
        if (result.matched === 0 && result.unmatchedCount === 0) {
          toast.info("Aucune réservation à mettre à jour.");
        }
        setOpen(false);
        setFile(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'import.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4" />
          Importer prix Superhote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer les prix depuis Superhote</DialogTitle>
          <DialogDescription>
            Sur Superhote : Calendriers → Actions → Exporter les réservations. Sélectionne le fichier
            reçu par email ici — le loyer et le montant payé seront remplis automatiquement pour les
            réservations déjà présentes dans l&apos;app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="csvFile">Fichier CSV</Label>
          <Input id="csvFile" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending || !file} onClick={handleImport} className="w-full sm:w-auto">
            {isPending ? "Import..." : "Importer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
