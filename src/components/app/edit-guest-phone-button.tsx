"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateGuestPhone } from "@/lib/actions/reservations";

// Seul moyen de corriger le téléphone d'une réservation déjà synchronisée : le sync iCal
// n'écrase plus jamais guestPhone une fois la réservation créée (voir ical/sync.ts), donc une
// correction faite côté Superhote ne remonte jamais toute seule ici — Kamel, 2026-08-20. Bouton
// imbriqué dans le <Link> cliquable de toute la carte (navigation vers la fiche villa), même
// principe que GuestWhatsAppButton pour stopPropagation/preventDefault.
export function EditGuestPhoneButton({ reservationId, guestPhone }: { reservationId: string; guestPhone: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(guestPhone ?? "");
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) setValue(guestPhone ?? "");
    setOpen(next);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateGuestPhone(reservationId, value);
        toast.success("Numéro mis à jour.");
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Corriger le numéro de téléphone"
          title="Corriger le numéro"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start" onClick={(e) => e.stopPropagation()}>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+33... ou +212..."
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Toujours avec l&apos;indicatif pays (+33, +212...) — sans ça, un numéro local est traité comme marocain par défaut.
        </p>
        <Button type="button" size="sm" className="w-full" disabled={isPending} onClick={handleSave}>
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
