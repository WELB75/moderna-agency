"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockRow } from "@/components/app/stock-row";
import { setDomaineStock } from "@/lib/actions/courses";

type Product = { id: string; nom: string };
type StockEntry = { domaineId: string; productId: string; quantite: number };

export function DomaineStockSection({
  domaineId,
  domaineNom,
  products,
  stock,
}: {
  domaineId: string;
  domaineNom: string;
  products: Product[];
  stock: StockEntry[];
}) {
  const quantitiesByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stock) {
      if (s.domaineId === domaineId) map.set(s.productId, s.quantite);
    }
    return map;
  }, [stock, domaineId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{domaineNom}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {products.map((p) => (
          <StockRow
            key={p.id}
            label={p.nom}
            quantite={quantitiesByProduct.get(p.id) ?? 0}
            onSave={(q) => setDomaineStock(domaineId, p.id, q)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
