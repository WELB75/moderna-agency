import {
  Zap,
  Droplets,
  Wind,
  Grid2x2,
  Sofa,
  PanelTop,
  PaintBucket,
  TreePine,
  Wifi,
  Sparkles,
  Wrench,
  Refrigerator,
  type LucideIcon,
} from "lucide-react";
import type { Categorie } from "@/lib/intervention-categorie";

export const CATEGORIE_ICONS: Record<Categorie, LucideIcon> = {
  electricite: Zap,
  plomberie: Droplets,
  climatisation: Wind,
  carrelage_sol: Grid2x2,
  mobilier: Sofa,
  vitres_fenetres: PanelTop,
  peinture_murs: PaintBucket,
  exterieur_jardin: TreePine,
  internet_domotique: Wifi,
  proprete: Sparkles,
  electromenager: Refrigerator,
  autre: Wrench,
};

export function CategorieIcon({ categorie, className }: { categorie: Categorie; className?: string }) {
  const Icon = CATEGORIE_ICONS[categorie];
  return <Icon className={className ?? "h-4 w-4"} />;
}
