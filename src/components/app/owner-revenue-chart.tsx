"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export function OwnerRevenueChart({ data, devise }: { data: { month: string; total: number }[]; devise: string }) {
  const config: ChartConfig = {
    total: { label: `Revenu (${devise})`, color: "#2563eb" },
  };

  return (
    <ChartContainer config={config} className="max-h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="total" fill="#2563eb" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
