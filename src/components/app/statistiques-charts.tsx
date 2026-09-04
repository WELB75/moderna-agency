"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MOIS_LABELS } from "@/lib/logement-stats";

export type PortfolioMoisStats = {
  ca: number;
  tauxOccupation: number; // 0-100
};

const caConfig: ChartConfig = {
  ca: { label: "Chiffre d'affaires (EUR)", color: "var(--chart-1)" },
};

const occupationConfig: ChartConfig = {
  tauxOccupation: { label: "Taux d'occupation (%)", color: "var(--chart-1)" },
};

// Vue d'ensemble du portefeuille au-dessus du tableau détaillé par logement — les deux
// indicateurs qui manquaient pour se comparer à un vrai dashboard analytics (façon
// millenium-connect.com) plutôt que la seule table mois par mois. Kamel, 2026-09-04.
export function StatistiquesCharts({ mois }: { mois: PortfolioMoisStats[] }) {
  const data = mois.map((m, i) => ({
    month: MOIS_LABELS[i],
    ca: Math.round(m.ca),
    tauxOccupation: Math.round(m.tauxOccupation),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Chiffre d&apos;affaires</CardTitle>
          <CardDescription>Portefeuille complet, par mois</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={caConfig} className="max-h-64 w-full">
            <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="ca" fill="var(--color-ca)" radius={6} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taux d&apos;occupation</CardTitle>
          <CardDescription>Portefeuille complet, par mois</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={occupationConfig} className="max-h-64 w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} unit="%" domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="tauxOccupation"
                type="monotone"
                stroke="var(--color-tauxOccupation)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--color-tauxOccupation)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
