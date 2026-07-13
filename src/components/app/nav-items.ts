import { LayoutDashboard, Wallet, ClipboardCheck, Building2 } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/caisse", label: "Caisse", icon: Wallet },
] as const;
