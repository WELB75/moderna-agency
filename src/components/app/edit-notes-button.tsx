"use client";

import { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateReservationNotes } from "@/lib/actions/reservations";

// Même piège que EditGuestPhoneButton : la carte réservation entière est un <Link> cliquable, un
// clic dans le popover (rendu en portail, donc hors du <Link> dans le DOM réel) doit être bloqué
// dès le pointerdown pour ne pas déclencher la navigation vers la fiche villa.
export function EditNotesButton({
  reservationId,
  notes,
  variant = "icon",
  onSaved,
}: {
  reservationId: string;
  notes: string | null;
  variant?: "icon" | "add";
  // Pour un affichage entièrement côté client (ex. le récapitulatif de l'onglet Tarification,
  // qui garde son propre état et ne se relit pas juste avec revalidatePath) : permet de refléter
  // la note tout de suite, sans attendre un rechargement complet de la page.
  onSaved?: (notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) setValue(notes ?? "");
    setOpen(next);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateReservationNotes(reservationId, value);
        onSaved?.(value.trim());
        toast.success("Note enregistrée.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {variant === "add" ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <StickyNote className="h-3 w-3" />
            Ajouter une note
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={notes ? "Modifier la note" : "Ajouter une note"}
            title={notes ? "Modifier la note" : "Ajouter une note"}
          >
            <StickyNote className="h-3 w-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-2"
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Ex. prévoir un lit bébé, allergie, arrivée tardive..."
          rows={3}
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
