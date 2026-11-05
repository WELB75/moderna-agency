"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { searchGlobal, type SearchResult } from "@/lib/actions/search";

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  reservation: "Réservation",
  intervention: "Travaux",
  maintenance: "Entretien",
  personnel: "Personnel",
};

// Recherche globale de l'en-tête : on tape directement dans la barre et les résultats s'affichent
// en dessous, au fil de la frappe — plus de fenêtre plein écran avec fond flouté (Kamel,
// 2026-11-03 : "ici je veux plus cet effet, je veux la recherche ajax direct ici").
// Clavier : ⌘K / Ctrl+K place le curseur dans la barre, ↑ ↓ choisissent un résultat, Entrée
// l'ouvre, Échap ferme la liste.
export function GlobalSearchOverlay() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requete = useRef(0);
  const listId = useId();

  const q = query.trim();
  const assez = q.length >= 2;

  // ⌘K / Ctrl+K : met le curseur dans la barre.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clic en dehors : referme la liste.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Recherche en direct, avec un court délai. Le numéro de requête évite qu'une réponse lente
  // d'une frappe précédente écrase le résultat de la frappe en cours.
  useEffect(() => {
    if (!assez) return;
    const numero = ++requete.current;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchGlobal(q);
        if (numero === requete.current) {
          setResults(r);
          setActive(-1);
        }
      } catch {
        if (numero === requete.current) setResults([]);
      } finally {
        if (numero === requete.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [q, assez]);

  function fermer() {
    setOpen(false);
    setActive(-1);
  }

  function ouvrir(r: SearchResult) {
    fermer();
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) fermer();
      else inputRef.current?.blur();
      return;
    }
    if (!assez || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const cible = results[active >= 0 ? active : 0];
      if (cible) {
        e.preventDefault();
        ouvrir(cible);
      }
    }
  }

  const afficherListe = open && assez;
  const resultatsAJour = assez ? results : [];

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 md:h-9">
        {loading && assez ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={afficherListe}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Rechercher"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Voyageur, villa, intervention…"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline-block">
            ⌘K
          </kbd>
        )}
      </div>

      {afficherListe ? (
        <div
          id={listId}
          role="listbox"
          className="fixed inset-x-3 top-safe-header z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg md:absolute md:inset-x-0 md:top-full md:mt-1.5 md:max-h-96"
        >
          {resultatsAJour.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{loading ? "Recherche…" : `Aucun résultat pour « ${q} ».`}</p>
          ) : (
            <ul>
              {resultatsAJour.map((r, i) => (
                <li
                  key={`${r.type}-${r.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <Link
                    href={r.href}
                    onClick={() => {
                      fermer();
                      setQuery("");
                      setResults([]);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${i === active ? "bg-muted" : "hover:bg-muted/60"}`}
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
