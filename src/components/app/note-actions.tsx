"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { basculerNoteResolue, supprimerNote } from "@/lib/actions/notes-villa";

export function NoteActions({ id, resolu }: { id: string; resolu: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const bouton =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={enCours}
        className={bouton}
        onClick={() =>
          demarrer(async () => {
            await basculerNoteResolue(id, !resolu);
            router.refresh();
          })
        }
      >
        {resolu ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {resolu ? "Rouvrir" : "Traité"}
      </button>
      <button
        type="button"
        disabled={enCours}
        aria-label="Supprimer la note"
        className={bouton}
        onClick={() => {
          if (!window.confirm("Supprimer cette note ?")) return;
          demarrer(async () => {
            try {
              await supprimerNote(id);
              router.refresh();
            } catch {
              toast.error("Suppression impossible.");
            }
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
