"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockRow } from "@/components/app/stock-row";
import { setVillaStock } from "@/lib/actions/courses";

type Villa = { id: string; nom: string; numero: string; domaineNom: string | null };
type Product = { id: string; nom: string };
type StockEntry = { villaId: string; productId: string; quantite: number };

export function VillaStockPanel({
  villas,
  products,
  stock,
}: {
  villas: Villa[];
  products: Product[];
  stock: StockEntry[];
}) {
  const [villaId, setVillaId] = useState(villas[0]?.id ?? "");

  const quantitiesByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stock) {
      if (s.villaId === villaId) map.set(s.productId, s.quantite);
    }
    return map;
  }, [stock, villaId]);

  if (villas.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune villa enregistrée.</p>;
  }

  return (
    <div className="space-y-4">
      <Select value={villaId} onValueChange={setVillaId}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="Sélectionner une villa" />
        </SelectTrigger>
        <SelectContent>
          {villas.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.domaineNom ? `${v.domaineNom} · ` : ""}
              {v.nom} (n°{v.numero})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-2">
        {products.map((p) => (
          <StockRow
            key={p.id}
            label={p.nom}
            quantite={quantitiesByProduct.get(p.id) ?? 0}
            onSave={(q) => setVillaStock(villaId, p.id, q)}
          />
        ))}
      </div>
    </div>
  );
}
