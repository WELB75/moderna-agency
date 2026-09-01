"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";
import { cn } from "@/lib/utils";

// Même rendu que StatusChip, mais cliquable : emmène directement sur le formulaire (page /g/[id]
// où il suffit de prendre le passeport en photo) plutôt que d'obliger à retrouver la fiche
// ailleurs — Kamel, 2026-09-01 : "je veux que quand on clic dessus ça nous renvoie direct au
// formulaire [...] j'ai juste a mettre le passeport". Si aucune fiche n'existe encore pour cette
// réservation, on la crée à la volée avant de naviguer (même geste que le bouton "Message
// d'arrivée", qui fait déjà cette création à la demande).
export function FichePoliceStatusChip({
  reservationId,
  villaId,
  ficheId,
  ficheStatut,
}: {
  reservationId: string;
  villaId: string | null;
  ficheId: string | null;
  ficheStatut: "complete" | "en_attente" | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const id = ficheId ?? (await createGendarmerieForm(reservationId, villaId)).id;
      router.push(ficheStatut === "complete" ? `/gendarmerie/${id}` : `/g/${id}`);
    });
  }

  const done = ficheStatut === "complete";
  const value = ficheStatut === "complete" ? "Faite" : ficheStatut === "en_attente" ? "En attente" : "Manquante";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-60",
        done
          ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 dark:border-emerald-500/20"
          : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/20"
      )}
    >
      <FileText className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Fiche police · </span>
        <span className="font-medium text-foreground">{isPending ? "…" : value}</span>
      </span>
    </button>
  );
}
