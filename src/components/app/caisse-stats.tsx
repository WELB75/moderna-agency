"use client";

import { useMemo } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CATEGORIE_LABELS } from "@/lib/caisse-labels";

type Entry = {
  type: string;
  categorie: string | null;
  montant: string;
  responsable: string | null;
  createdAt: Date;
  villaNom: string | null;
  villaNumero: string | null;
};

const MOIS_LABELS = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

// Palette vive et distincte (volontairement pas la palette monochrome de l'app :
// ici on code chaque personne par une couleur reconnaissable).
const PALETTE = [
  "#2563eb", // bleu
  "#f97316", // orange
  "#16a34a", // vert
  "#9333ea", // violet
  "#dc2626", // rouge
  "#0d9488", // teal
  "#db2777", // rose
  "#ca8a04", // jaune foncé
];

export function CaisseStats({ entries }: { entries: Entry[] }) {
  const depenses = useMemo(() => entries.filter((e) => e.type === "depense" && e.responsable), [entries]);

  const responsables = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const e of depenses) {
      const nom = e.responsable!;
      const current = totals.get(nom) ?? { total: 0, count: 0 };
      current.total += Number(e.montant);
      current.count += 1;
      totals.set(nom, current);
    }
    return Array.from(totals.entries())
      .map(([nom, v], i) => ({ nom, ...v, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.total - a.total);
  }, [depenses]);

  const pieChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    responsables.forEach((r) => {
      config[r.nom] = { label: r.nom, color: r.color };
    });
    return config;
  }, [responsables]);

  const pieData = useMemo(
    () => responsables.map((r) => ({ name: r.nom, value: r.total, fill: r.color })),
    [responsables]
  );

  const categories = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const e of depenses) {
      const cle = e.categorie ?? "non_categorise";
      const current = totals.get(cle) ?? { total: 0, count: 0 };
      current.total += Number(e.montant);
      current.count += 1;
      totals.set(cle, current);
    }
    return Array.from(totals.entries())
      .map(([cle, v], i) => ({
        cle,
        label: CATEGORIE_LABELS[cle] ?? "Non catégorisé",
        ...v,
        color: PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.total - a.total);
  }, [depenses]);

  const categoriePieConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    categories.forEach((c) => {
      config[c.label] = { label: c.label, color: c.color };
    });
    return config;
  }, [categories]);

  const categoriePieData = useMemo(
    () => categories.map((c) => ({ name: c.label, value: c.total, fill: c.color })),
    [categories]
  );

  // Dépenses "hébergement" regroupées par bien — c'est ce que la comptable veut retrouver
  // dans le rapport financier des propriétaires (combien chaque villa a coûté).
  const depensesParVilla = useMemo(() => {
    const totals = new Map<string, { total: number; count: number; numero: string | null }>();
    for (const e of depenses) {
      if (e.categorie !== "hebergement") continue;
      const nom = e.villaNom ?? "Bien non précisé";
      const current = totals.get(nom) ?? { total: 0, count: 0, numero: e.villaNumero };
      current.total += Number(e.montant);
      current.count += 1;
      totals.set(nom, current);
    }
    return Array.from(totals.entries())
      .map(([nom, v]) => ({ nom, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [depenses]);

  const monthlyTotals = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const e of depenses) {
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(e.montant));
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, total]) => {
        const [year, monthIdx] = key.split("-").map(Number);
        return { month: `${MOIS_LABELS[monthIdx]} ${year}`, total };
      });
  }, [depenses]);

  const lineChartConfig: ChartConfig = {
    total: { label: "Total dépensé", color: "#2563eb" },
  };

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()).padStart(2, "0")}`;

  const totalByMonthKey = (key: string) =>
    depenses
      .filter((e) => {
        const d = new Date(e.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}` === key;
      })
      .reduce((s, e) => s + Number(e.montant), 0);

  const totalThisMonth = totalByMonthKey(thisMonthKey);
  const totalLastMonth = totalByMonthKey(lastMonthKey);
  const trend =
    totalLastMonth > 0 ? Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100) : null;

  if (depenses.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune dépense enregistrée pour l&apos;instant.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{totalThisMonth.toFixed(2)} DH</p>
            <p className="text-sm text-muted-foreground">
              Dépensé ce mois-ci
              {trend !== null ? (
                <span className={trend > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                  {" "}
                  ({trend > 0 ? "+" : ""}
                  {trend}% vs mois dernier)
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{responsables.length}</p>
            <p className="text-sm text-muted-foreground">Personnes actives</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="flex items-center gap-2 text-2xl font-semibold">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: responsables[0]?.color }}
              />
              {responsables[0]?.nom ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              Plus gros total ({responsables[0]?.total.toFixed(2) ?? 0} DH)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par personne</CardTitle>
            <CardDescription>Qui a pris quoi, au total</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-72">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={100}
                  strokeWidth={2}
                  stroke="var(--background)"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Évolution mensuelle</CardTitle>
            <CardDescription>Total dépensé, mois par mois</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="max-h-72 w-full">
              <LineChart data={monthlyTotals} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="total"
                  type="monotone"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#2563eb" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par catégorie</CardTitle>
            <CardDescription>Femmes de ménage, cuisinières, jardinier, hébergement</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={categoriePieConfig} className="mx-auto aspect-square max-h-72">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={categoriePieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={100}
                  strokeWidth={2}
                  stroke="var(--background)"
                >
                  {categoriePieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dépenses par bien (Hébergement)</CardTitle>
            <CardDescription>Pour le fichier financier des propriétaires</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {depensesParVilla.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune dépense hébergement enregistrée.</p>
            ) : (
              depensesParVilla.map((v) => (
                <div key={v.nom} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="font-medium">
                      {v.nom}
                      {v.numero ? ` (n°${v.numero})` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {v.count} dépense{v.count > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="font-semibold">{v.total.toFixed(2)} DH</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement par personne</CardTitle>
          <CardDescription>Total dépensé/remis, tous mois confondus</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {responsables.map((r) => (
            <div key={r.nom} className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                <p className="font-medium">{r.nom}</p>
                <p className="text-sm text-muted-foreground">
                  {r.count} mouvement{r.count > 1 ? "s" : ""}
                </p>
              </div>
              <p className="font-semibold">{r.total.toFixed(2)} DH</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
