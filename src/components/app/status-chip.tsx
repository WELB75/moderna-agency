import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Petit statut compact (icône + libellé + valeur), utilisé sur les cartes de réservation
// (tableau de bord) et sur la fiche de séjour partagée en lien public.
export function StatusChip({
  icon: Icon,
  label,
  value,
  done,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        done
          ? "border-emerald-500/30 bg-emerald-500/5 dark:border-emerald-500/20"
          : "border-amber-500/30 bg-amber-500/5 dark:border-amber-500/20"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">{label} · </span>
        <span className="font-medium text-foreground">{value}</span>
      </span>
    </div>
  );
}
