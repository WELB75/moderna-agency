"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Receipt, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateReservationNotes } from "@/lib/actions/reservations";
import { noteContientUnMontant } from "@/lib/compta-reservation-format";

// La carte réservation entière est un <Link> cliquable, et les événements React remontent aussi à
// travers un portail : un clic dans la fenêtre doit être bloqué dès le pointerdown, sinon il
// déclenche la navigation vers la fiche villa.
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

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      {variant === "add" ? (
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenChange(true);
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <StickyNote className="h-3 w-3" />
          Ajouter une note
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenChange(true);
          }}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={notes ? "Modifier la note" : "Ajouter une note"}
          title={notes ? "Modifier la note" : "Ajouter une note"}
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[min(94vw,34rem)] max-w-none gap-4 p-4 sm:p-6"
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onKeyDown={stop}
        >
          <DialogHeader>
            <DialogTitle>Note de la réservation</DialogTitle>
            <DialogDescription>
              Pour l&apos;équipe : demandes particulières, horaires, matériel. Les prix et les options facturées vont dans le détail financier.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex. prévoir un lit bébé, allergie aux arachides, arrivée tardive vers 23h..."
            rows={8}
            className="min-h-40 resize-y text-base sm:text-sm"
            autoFocus
          />

          {noteContientUnMontant(value) ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <Receipt className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Cette note contient des montants. Pour que la comptable les voie dans les chiffres, les saisir plutôt dans le{" "}
                <Link href={`/reservations/${reservationId}`} className="font-medium underline underline-offset-2" onClick={stop}>
                  détail financier de la réservation
                </Link>
                .
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
