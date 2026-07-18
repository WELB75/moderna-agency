"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitInterventionValidation } from "@/lib/actions/interventions";
import { cn } from "@/lib/utils";

export function InterventionValidation({
  interventionId,
  validationStatut,
  validationNote,
  validationAt,
}: {
  interventionId: string;
  validationStatut: string | null;
  validationNote: string | null;
  validationAt: Date | null;
}) {
  const [editing, setEditing] = useState(!validationStatut);
  const [choice, setChoice] = useState<"accepte" | "refuse" | null>(
    validationStatut === "accepte" || validationStatut === "refuse" ? validationStatut : null
  );
  const [note, setNote] = useState(validationNote ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!choice) {
      toast.error("Choisis Accepté ou Refusé.");
      return;
    }
    startTransition(async () => {
      try {
        await submitInterventionValidation(interventionId, choice, note);
        toast.success("Validation enregistrée.");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Validation du patron</p>

      {!editing && validationStatut ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                validationStatut === "accepte"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-destructive/50 bg-destructive/10 text-destructive"
              )}
            >
              {validationStatut === "accepte" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {validationStatut === "accepte" ? "Accepté" : "Refusé"}
            </Badge>
            {validationAt ? (
              <span className="text-xs text-muted-foreground">
                {format(new Date(validationAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
              </span>
            ) : null}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
          {validationNote ? <p className="whitespace-pre-line text-sm">{validationNote}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={choice === "accepte" ? "default" : "outline"}
              size="sm"
              onClick={() => setChoice("accepte")}
              className={choice === "accepte" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              <Check className="h-3.5 w-3.5" />
              Accepté
            </Button>
            <Button
              type="button"
              variant={choice === "refuse" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setChoice("refuse")}
            >
              <X className="h-3.5 w-3.5" />
              Refusé
            </Button>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note (optionnelle)"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
            {validationStatut ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
