"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowUp, ArrowDown, X, Plus, RotateCcw } from "lucide-react";
import { addProcedureStep, removeProcedureStep, moveProcedureStep } from "@/lib/actions/procedures";

export function ProcedureCard({
  procedure,
}: {
  procedure: { id: string; titre: string; description: string | null; etapes: string[] };
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [newStep, setNewStep] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(index: number) {
    setChecked((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  function handleAdd() {
    const step = newStep.trim();
    if (!step) return;
    setNewStep("");
    startTransition(async () => {
      try {
        await addProcedureStep(procedure.id, step);
      } catch {
        toast.error("Erreur lors de l'ajout de l'étape.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{procedure.titre}</CardTitle>
        {procedure.description ? <CardDescription>{procedure.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setChecked({})}>
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        </div>

        <div className="space-y-1">
          {procedure.etapes.map((etape, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox
                checked={!!checked[index]}
                onCheckedChange={() => toggle(index)}
                className="shrink-0"
              />
              <span className={checked[index] ? "flex-1 text-sm line-through text-muted-foreground" : "flex-1 text-sm"}>
                {etape}
              </span>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isPending || index === 0}
                  onClick={() => startTransition(() => moveProcedureStep(procedure.id, index, "up"))}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isPending || index === procedure.etapes.length - 1}
                  onClick={() => startTransition(() => moveProcedureStep(procedure.id, index, "down"))}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={() => startTransition(() => removeProcedureStep(procedure.id, index))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Ajouter une étape"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" variant="outline" size="icon" disabled={isPending} onClick={handleAdd}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
