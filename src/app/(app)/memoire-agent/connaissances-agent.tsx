"use client";

import { useEffect, useState } from "react";
import { Award, Flame, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORIES_SUJETS, type ConnaissanceSujet, type Connaissances } from "@/lib/messages-agent/memoire-regles";

// Section ludique : ce que l'agent maîtrise, sujet par sujet. Les pourcentages sont calculés sur
// les échanges et fiches réels (voir calculerConnaissances) : ils montent à mesure que l'agent
// lit des conversations et que les fiches sont rédigées ou validées.

type Stats = { filsAnalyses: number; fichesActives: number; echanges: number };

// Paliers à débloquer : chacun s'allume quand le seuil est atteint.
function jalons(c: Connaissances, s: Stats): { libelle: string; atteint: boolean }[] {
  return [
    { libelle: "Première conversation lue", atteint: s.filsAnalyses >= 1 },
    { libelle: "10 conversations lues", atteint: s.filsAnalyses >= 10 },
    { libelle: "50 conversations lues", atteint: s.filsAnalyses >= 50 },
    { libelle: "200 conversations lues", atteint: s.filsAnalyses >= 200 },
    { libelle: "100 échanges retenus", atteint: s.echanges >= 100 },
    { libelle: "10 fiches actives", atteint: s.fichesActives >= 10 },
    { libelle: "Un sujet maîtrisé à 75 %", atteint: c.maitrises >= 1 },
    { libelle: "10 sujets maîtrisés", atteint: c.maitrises >= 10 },
  ];
}

function couleur(pct: number): string {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-[#660033]";
  if (pct >= 25) return "bg-amber-500";
  return "bg-muted-foreground/50";
}

function Barre({ pct, anime }: { pct: number; anime: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-1000 ease-out ${couleur(pct)}`} style={{ width: anime ? `${pct}%` : "0%" }} />
    </div>
  );
}

export function ConnaissancesAgent({ connaissances: c, stats }: { connaissances: Connaissances; stats: Stats }) {
  // Les barres se remplissent à l'affichage.
  const [anime, setAnime] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnime(true), 50);
    return () => clearTimeout(t);
  }, []);

  const paliers = jalons(c, stats);
  const parCategorie = new Map<string, ConnaissanceSujet[]>();
  for (const s of c.sujets) parCategorie.set(s.categorie, [...(parCategorie.get(s.categorie) ?? []), s]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Ce que l&apos;agent maîtrise</h2>
        <p className="text-sm text-muted-foreground">
          Son niveau sur chaque sujet de notre activité. Le pourcentage monte avec le nombre de vrais échanges lus sur le sujet, les fiches rédigées ou
          validées, et pour certains sujets (wifi, clés, localisation, équipements) avec les informations saisies sur les
          fiches des logements.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Indice de connaissance global</p>
              <p className="text-4xl font-semibold tabular-nums">{c.global}%</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Award className="h-4 w-4 text-emerald-600" />
                {c.maitrises} / {c.sujets.length} sujets maîtrisés
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-[#660033]" />+{c.cetteSemaine} échange{c.cetteSemaine > 1 ? "s" : ""} cette semaine
              </span>
            </div>
          </div>
          <Barre pct={c.global} anime={anime} />

          {c.aEnrichir.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <Target className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="text-muted-foreground">À enrichir en priorité :</span>
              {c.aEnrichir.map((s) => (
                <Badge key={s.code} variant="outline">
                  {s.libelle} · {s.pct}%
                </Badge>
              ))}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            {paliers.map((p) => (
              <Badge key={p.libelle} variant="outline" className={p.atteint ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "opacity-50"}>
                {p.atteint ? <Sparkles className="h-3 w-3" /> : null}
                {p.libelle}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIES_SUJETS.map((cat) => {
          const sujets = parCategorie.get(cat.code) ?? [];
          if (sujets.length === 0) return null;
          const moyenne = Math.round(sujets.reduce((t, s) => t + s.pct, 0) / sujets.length);
          return (
            <Card key={cat.code}>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{cat.libelle}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">{moyenne}%</span>
                </div>
                <div className="space-y-3">
                  {sujets.map((s) => (
                    <div key={s.code} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{s.libelle}</span>
                        <span className="shrink-0 tabular-nums font-medium">{s.pct}%</span>
                      </div>
                      <Barre pct={s.pct} anime={anime} />
                      <p className="flex justify-between text-[11px] text-muted-foreground">
                        <span>
                          {s.niveau} · {s.echanges} échange{s.echanges > 1 ? "s" : ""} · {s.fiches} fiche{s.fiches > 1 ? "s" : ""}
                          {s.logements ? ` · ${s.logements.renseignes}/${s.logements.total} logements renseignés` : ""}
                          {s.integre ? " · règle de l'agence intégrée" : ""}
                        </span>
                        {s.cetteSemaine > 0 ? <span className="text-emerald-600 dark:text-emerald-400">+{s.cetteSemaine} cette semaine</span> : null}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
