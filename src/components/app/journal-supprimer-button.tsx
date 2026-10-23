"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supprimerEntreeJournal } from "@/lib/actions/journal";

// Deux clics pour supprimer : le premier arme le bouton (« Confirmer »), le second supprime. Se
// désarme tout seul après quelques secondes. `avertissement` : ligne dont l'app se sert (création,
// fermeture Beds24), précisé avant la confirmation.
export function JournalSupprimerButton({ id, avertissement }: { id: string; avertissement?: string }) {
  const [arme, setArme] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!arme) return;
    const t = setTimeout(() => setArme(false), 5000);
    return () => clearTimeout(t);
  }, [arme]);

  function cliquer() {
    if (!arme) {
      setArme(true);
      if (avertissement) toast.warning(avertissement, { duration: 5000 });
      return;
    }
    startTransition(async () => {
      try {
        await supprimerEntreeJournal(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Suppression impossible.");
        setArme(false);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={cliquer}
      disabled={pending}
      aria-label={arme ? "Confirmer la suppression de cette ligne" : "Supprimer cette ligne du journal"}
      title={arme ? "Cliquer pour confirmer" : "Supprimer cette ligne"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors max-md:min-h-9",
        arme ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {arme ? "Confirmer" : null}
    </button>
  );
}
