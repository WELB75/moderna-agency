"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MOIS_LABELS, type MontantParDevise } from "@/lib/logement-stats";

export type LogementMoisStats = {
  nuitees: number;
  ca: MontantParDevise[];
  encaisse: MontantParDevise[];
  depenses: MontantParDevise[];
  tresorerie: MontantParDevise[];
};

export type LogementStatsRow = {
  villaId: string;
  nom: string;
  numero: string;
  domaineNom: string | null;
  mois: LogementMoisStats[]; // 12 entrées, index 0 = janvier
};

type Onglet = "nuitees" | "ca" | "tresorerie" | "depenses";

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: "nuitees", label: "Nuitées" },
  { value: "ca", label: "Chiffre d'affaires" },
  { value: "tresorerie", label: "Trésorerie" },
  { value: "depenses", label: "Dépenses" },
];

// Pour chaque onglet, plus la valeur est haute plus c'est vert — sauf les dépenses, où dépenser
// moins est ce qu'on veut voir en vert (dépenser plus doit alerter en rouge).
const INVERSE_COULEUR: Record<Onglet, boolean> = {
  nuitees: false,
  ca: false,
  tresorerie: false,
  depenses: true,
};

function valeurCellule(stats: LogementMoisStats, onglet: Onglet): MontantParDevise[] | number {
  if (onglet === "nuitees") return stats.nuitees;
  if (onglet === "ca") return stats.ca;
  if (onglet === "tresorerie") return stats.tresorerie;
  return stats.depenses;
}

// Une cellule peut contenir plusieurs devises (loyers en EUR, dépenses en MAD...) — on ne les
// additionne jamais entre elles (ça n'a aucun sens), mais pour colorer la cellule il faut UN
// nombre : on prend celle dont le montant absolu est le plus grand.
function montantDominant(montants: MontantParDevise[]): number {
  if (montants.length === 0) return 0;
  return montants.reduce((max, m) => (Math.abs(m.montant) > Math.abs(max) ? m.montant : max), montants[0].montant);
}

function heatValue(stats: LogementMoisStats, onglet: Onglet): number {
  const v = valeurCellule(stats, onglet);
  return typeof v === "number" ? v : montantDominant(v);
}

// 5 paliers (comme la légende Superhote "Faible ... Élevé") calculés par mois (colonne) sur
// l'ensemble des logements — permet de repérer d'un coup d'œil, pour un mois donné, quel
// logement a le mieux/moins bien tourné par rapport aux autres.
const PALIERS = [
  "bg-red-200/50 dark:bg-red-900/40",
  "bg-red-100/50 dark:bg-red-950/40",
  "",
  "bg-emerald-100/60 dark:bg-emerald-950/40",
  "bg-emerald-200/60 dark:bg-emerald-900/40",
];

function classeCouleur(value: number, min: number, max: number, inverse: boolean): string {
  if (max === min) return "";
  const ratio = (value - min) / (max - min);
  const palier = Math.min(4, Math.max(0, Math.floor(ratio * 5)));
  const index = inverse ? 4 - palier : palier;
  return PALIERS[index];
}

function formatMontants(montants: MontantParDevise[]): string {
  if (montants.length === 0) return "–";
  return montants
    .map((m) => `${Math.round(m.montant).toLocaleString("fr-FR")} ${m.devise === "EUR" ? "€" : m.devise}`)
    .join(" · ");
}

export function StatistiquesTable({ rows, year }: { rows: LogementStatsRow[]; year: number }) {
  const [onglet, setOnglet] = useState<Onglet>("nuitees");

  // Min/max par colonne (mois), calculés sur l'onglet actif — les couleurs changent donc bien
  // de sens en changeant d'onglet (ex. beaucoup de dépenses en rouge, beaucoup de nuitées en vert).
  const bornesParMois = MOIS_LABELS.map((_, moisIndex) => {
    const valeurs = rows.map((r) => heatValue(r.mois[moisIndex], onglet));
    return { min: Math.min(...valeurs, 0), max: Math.max(...valeurs, 0) };
  });

  const totauxParMois = MOIS_LABELS.map((_, moisIndex) => {
    if (onglet === "nuitees") {
      return rows.reduce((sum, r) => sum + (r.mois[moisIndex].nuitees ?? 0), 0);
    }
    let total: MontantParDevise[] = [];
    for (const r of rows) {
      const montants = valeurCellule(r.mois[moisIndex], onglet) as MontantParDevise[];
      for (const m of montants) {
        const idx = total.findIndex((t) => t.devise === m.devise);
        if (idx === -1) total = [...total, { ...m }];
        else total[idx] = { ...total[idx], montant: total[idx].montant + m.montant };
      }
    }
    return total;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
          <TabsList>
            {ONGLETS.map((o) => (
              <TabsTrigger key={o.value} value={o.value}>
                {o.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/statistiques?annee=${year - 1}`}
            className="rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {year - 1}
          </Link>
          <span className="font-medium">{year}</span>
          <Link
            href={`/statistiques?annee=${year + 1}`}
            className="rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {year + 1}
          </Link>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background">Hébergement</TableHead>
              {MOIS_LABELS.map((label) => (
                <TableHead key={label} className="text-right">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.villaId}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  <Link href={`/villas/${row.villaId}`} className="hover:underline">
                    {row.nom}
                  </Link>
                </TableCell>
                {row.mois.map((stats, moisIndex) => {
                  const value = valeurCellule(stats, onglet);
                  const heat = heatValue(stats, onglet);
                  const { min, max } = bornesParMois[moisIndex];
                  const couleur = classeCouleur(heat, min, max, INVERSE_COULEUR[onglet]);
                  return (
                    <TableCell key={moisIndex} className={cn("text-right tabular-nums", couleur)}>
                      {typeof value === "number" ? value : formatMontants(value)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-medium">
              <TableCell className="sticky left-0 z-10 bg-background">Total</TableCell>
              {totauxParMois.map((total, i) => (
                <TableCell key={i} className="text-right tabular-nums">
                  {typeof total === "number" ? total : formatMontants(total)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Faible</span>
        <div className="flex overflow-hidden rounded">
          {PALIERS.map((p, i) => (
            <div key={i} className={cn("h-3 w-6 border", p || "bg-background")} />
          ))}
        </div>
        <span>Élevé</span>
        {onglet === "depenses" ? <span className="ml-1">(vert = peu dépensé, rouge = beaucoup dépensé)</span> : null}
      </div>
    </div>
  );
}
