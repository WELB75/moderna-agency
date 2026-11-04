import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { compacterJours, deplierJours } from "./jours";
import type { TarificationVilla } from "./sync";
import { prixDirect, type Fourchette } from "@/lib/prix-direct";

// Fourchettes de prix direct par logement (colonne villas.prix_direct), pour les devis.
export async function chargerPrixDirect(): Promise<Map<string, Fourchette>> {
  const rows = await getDb().select({ id: villas.id, prixDirect: villas.prixDirect }).from(villas).where(isNotNull(villas.prixDirect));
  return new Map(rows.flatMap((r) => (r.prixDirect ? [[r.id, r.prixDirect] as [string, Fourchette]] : [])));
}

// Remplace les prix PriceLabs des logements qui ont une fourchette directe par leur prix direct.
// La fourchette plateforme est celle réglée dans PriceLabs (mini / base / maximum de l'annonce).
export async function appliquerPrixDirect(liste: TarificationVilla[]): Promise<TarificationVilla[]> {
  const directes = await chargerPrixDirect();
  if (directes.size === 0) return liste;
  return liste.map((v) => {
    const direct = directes.get(v.id);
    if (!direct || v.minPrice == null || v.basePrice == null || v.maxPrice == null) return v;
    const plateforme = { min: v.minPrice, base: v.basePrice, max: v.maxPrice };
    const jours = deplierJours(v.jours).map((j) => ({ ...j, price: j.price == null ? null : prixDirect(j.price, plateforme, direct) }));
    return {
      ...v,
      minPrice: direct.min,
      basePrice: direct.base,
      maxPrice: direct.max,
      jours: compacterJours(jours),
      tarifDirect: true,
    };
  });
}
