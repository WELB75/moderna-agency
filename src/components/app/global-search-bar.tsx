"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { searchGlobal, type SearchResult } from "@/lib/actions/search";

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  reservation: "Réservation",
  intervention: "Travaux",
  maintenance: "Entretien",
  personnel: "Personnel",
};

// Recherche unique en haut de l'accueil (façon "Where to?") : réservations depuis le début,
// travaux, personnel ménage/cuisine — tout dans une seule barre plutôt que de devoir savoir
// dans quelle page chercher.
export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const r = await searchGlobal(q);
        setResults(r);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3 rounded-2xl bg-black/70 px-4 py-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.25)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150">
        {isPending ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/70" />
        ) : (
          <Search className="h-5 w-5 shrink-0 text-white/70" />
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un client, des travaux, une femme de ménage, une cuisinière..."
          className="w-full min-w-0 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/50"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            aria-label="Effacer la recherche"
          >
            <X className="h-5 w-5 text-white/70" />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl bg-popover/90 shadow-[0_8px_30px_rgb(0,0,0,0.15)] ring-1 ring-white/60 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/10">
          {isPending && results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Recherche...</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Aucun résultat pour « {query} ».</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`} className="border-b border-border/50 last:border-b-0">
                  <Link
                    href={r.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/60"
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
    </div>
  );
}
