"use client";

import { useEffect, useState, useTransition } from "react";
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
export function GlobalSearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Rechercher"
          className="flex items-center justify-center border border-border p-2 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("global-search-input")?.focus();
          }}
          className="fixed left-1/2 top-[12%] z-50 w-full max-w-xl -translate-x-1/2 border border-border bg-popover text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <DialogTitle className="sr-only">Recherche</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <input
              id="global-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un client, des travaux, une femme de ménage, une cuisinière..."
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {showResults ? (
            <div className="max-h-96 overflow-y-auto">
              {isPending && results.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Recherche...</p>
              ) : results.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Aucun résultat pour « {query} ».</p>
              ) : (
                <ul>
                  {results.map((r) => (
                    <li key={`${r.type}-${r.id}`} className="border-b border-border last:border-b-0">
                      <Link
                        href={r.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
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
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
