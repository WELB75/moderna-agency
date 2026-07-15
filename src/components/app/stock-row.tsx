"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, Plus, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StockRow({
  label,
  quantite,
  onSave,
}: {
  label: string;
  quantite: number;
  onSave: (quantite: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quantite);
  const [isPending, startTransition] = useTransition();

  function save(next: number) {
    const clamped = Math.max(0, next);
    setValue(clamped);
    startTransition(async () => {
      try {
        await onSave(clamped);
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-sm">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={isPending}
            onClick={() => save(value - 1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="h-7 w-14 text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={isPending}
            onClick={() => save(value + 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-7 w-7"
            disabled={isPending}
            onClick={() => save(value)}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue(quantite);
            setEditing(true);
          }}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-muted"
        >
          {quantite}
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
