import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Petits éléments partagés par les blocs de l'accueil (2026-10-21, refonte "épurée") : une seule
// façon de dessiner une ligne de résumé repliable (icône dans une pastille, titre, compteurs,
// chevron) et un seul style de sous-titre de section, pour que Caution/fiche police, Tâches du
// jour, Villas libres et les jours de l'agenda se ressemblent au lieu d'avoir chacun leur
// typographie et leurs marges.

// Pastille d'icône à gauche d'une ligne de résumé (32px, fond doux, teinte selon l'état).
export function RowIcon({
  icon: Icon,
  tone = "neutre",
  className,
}: {
  icon: LucideIcon;
  tone?: "neutre" | "ok" | "attente" | "urgent" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        tone === "ok" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tone === "attente" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        tone === "urgent" && "bg-red-500/10 text-red-600 dark:text-red-400",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "neutre" && "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

// Classes d'une ligne <summary> : hauteur confortable au doigt (min 56px), pas de marqueur natif.
export const summaryRowClass =
  "flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 marker:content-none select-none [&::-webkit-details-marker]:hidden";

// Chevron qui pivote quand le <details> parent (class "group") est ouvert.
export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180", className)}
      aria-hidden
    />
  );
}

// Titre de ligne + sous-texte, alignés sur deux lignes (ou une seule si pas de sous-texte).
export function RowTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold leading-tight">{children}</span>
      {sub ? <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">{sub}</span> : null}
    </span>
  );
}

// Sous-titre de section (dans le corps d'une carte) : petites capitales grises.
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</p>
  );
}

// Point coloré + libellé, pour les compteurs d'état dans les lignes de résumé.
export function StatusDot({
  tone,
  children,
  className,
}: {
  tone: "ok" | "attente" | "urgent" | "neutre";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "attente" && "bg-amber-500",
          tone === "urgent" && "bg-red-500",
          tone === "neutre" && "bg-muted-foreground/40"
        )}
      />
      <span className={cn(tone === "urgent" && "font-medium text-red-600 dark:text-red-400")}>{children}</span>
    </span>
  );
}
