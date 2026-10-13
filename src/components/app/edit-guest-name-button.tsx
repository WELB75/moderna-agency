"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateGuestName } from "@/lib/actions/reservations";

// Modifier le nom affiché d'une réservation (ex. "Airbnb" à la place d'un voyageur dont la
// réservation a été annulée) — même construction que EditGuestPhoneButton, y compris les
// stopPropagation nécessaires quand la carte entière est un <Link>.
export function EditGuestNameButton({ reservationId, guestName }: { reservationId: string; guestName: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(guestName);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) setValue(guestName);
    setOpen(next);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateGuestName(reservationId, value);
        toast.success("Nom mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Modifier le nom affiché"
          title="Modifier le nom"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 space-y-2"
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Nom du voyageur"
          autoFocus
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={isPending}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSave();
          }}
        >
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
