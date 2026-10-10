"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Search, Loader2 } from "lucide-react";
import { DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { searchGlobal, type SearchResult } from "@/lib/actions/search";

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  reservation: "Réservation",
  intervention: "Travaux",
  maintenance: "Entretien",
  personnel: "Personnel",
};

// Version "palette de commande" de la recherche globale : une simple loupe pour ne plus
// occuper une ligne entière de l'accueil en permanence — le clic ouvre un calque assombri
// avec la barre de recherche en haut, résultats en direct (même logique/action que
// GlobalSearchBar, gardée séparée pour la présentation en calque plutôt qu'en dropdown inline).
//
// Habillage "verre liquide" façon Apple, poussé plus loin : anneau lumineux qui tourne
// lentement autour du panneau, reflet qui suit le curseur (mix-blend-mode, pas de couleur —
// Kamel garde une charte strictement monochrome), balayage lumineux pendant la recherche,
// résultats qui entrent en cascade. Kamel, 2026-08-20 : "tu peux mieux faire encore je veux
// vraiment un truc du futur !" (suite à une première passe jugée pas assez poussée).
// variant="bar" : barre de recherche façon SuperHote v2 dans l'en-tête (libellé + raccourci ⌘K),
// variant="icon" (défaut) : simple loupe, comme avant.
export function GlobalSearchOverlay({ variant = "icon" }: { variant?: "icon" | "bar" } = {}) {
  const [open, setOpen] = useState(false);

  // Raccourci clavier ⌘K / Ctrl+K — seulement sur l'instance "bar" (en-tête), pour ne pas ouvrir
  // deux calques si la loupe de l'accueil est aussi présente à l'écran.
  useEffect(() => {
    if (variant !== "bar") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const r = await searchGlobal(q);
        setResults(r);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const showResults = query.trim().length >= 2;

  // Reflet qui suit le curseur sur le verre — en ref/style direct (pas de setState) pour rester
  // fluide à chaque pixel de déplacement sans re-render React.
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    panelRef.current?.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    panelRef.current?.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        {variant === "bar" ? (
          <button
            type="button"
            aria-label="Rechercher"
            className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Voyageur, villa, intervention…</span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline-block">
              ⌘K
            </kbd>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Rechercher"
            className="flex items-center justify-center border border-border p-2 text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay className="bg-black/40 backdrop-blur-md" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("global-search-input")?.focus();
          }}
          onPointerMove={handlePointerMove}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] p-px outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
          style={{ "--mx": "50%", "--my": "0%" } as React.CSSProperties}
        >
          {/* Anneau lumineux : conic-gradient en niveaux de gris qui tourne lentement,
              masqué en anneau de ~1px via le padding du parent (p-px) + le panneau intérieur
              opaque par-dessus. */}
          <div
            className="search-ring-spin pointer-events-none absolute inset-[-40%] rounded-[28px]"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 25deg, transparent 70deg, transparent 360deg)",
            }}
          />
          <div
            ref={panelRef}
            className={
              "relative max-h-[calc(100dvh-2.2rem)] overflow-y-auto rounded-[27px] border border-white/25 text-popover-foreground shadow-[0_20px_70px_rgb(0,0,0,0.4)] outline-none backdrop-saturate-150 transition-[backdrop-filter,background-color] duration-300 ease-out " +
              (showResults ? "bg-background/92 backdrop-blur-3xl" : "bg-background/72 backdrop-blur-2xl")
            }
          >
            {/* Reflet qui suit le curseur — blend "overlay" pour rester neutre en clair/sombre. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[27px] opacity-60 mix-blend-overlay"
              style={{
                background: "radial-gradient(360px circle at var(--mx) var(--my), white, transparent 55%)",
              }}
            />

            <DialogTitle className="sr-only">Recherche</DialogTitle>
            <div className="relative flex items-center gap-4 overflow-hidden px-6 py-6">
              {isPending ? (
                <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-6 w-6 shrink-0 text-muted-foreground" />
              )}
              <input
                id="global-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                className="relative z-10 w-full min-w-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground/70 sm:text-3xl"
              />
              {/* Balayage lumineux pendant le calcul des résultats. */}
              {isPending ? (
                <div
                  className="search-shimmer-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
                />
              ) : null}
            </div>

            {showResults ? (
              <div className="relative max-h-96 overflow-y-auto border-t border-white/15">
                {isPending && results.length === 0 ? (
                  <p className="p-5 text-base text-muted-foreground">Recherche...</p>
                ) : results.length === 0 ? (
                  <p className="p-5 text-base text-muted-foreground">Aucun résultat pour « {query} ».</p>
                ) : (
                  <ul>
                    {results.map((r, i) => (
                      <li key={`${r.type}-${r.id}`} className="search-item-in border-b border-white/10 last:border-b-0" style={{ animationDelay: `${i * 25}ms` }}>
                        <Link
                          href={r.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-foreground/5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-base font-medium">{r.title}</p>
                            <p className="truncate text-sm text-muted-foreground">{r.subtitle}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {TYPE_LABELS[r.type]}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
