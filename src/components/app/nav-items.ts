import { LayoutDashboard, Wallet, ClipboardCheck, Building2, Wrench, ListTodo, Home, ShoppingCart, User, Gauge, FileText } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/a-faire", label: "À faire", icon: ListTodo },
  { href: "/appartements", label: "Appartements", icon: Home },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/interventions", label: "Interventions", icon: Gauge },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/courses", label: "Courses", icon: ShoppingCart },
  { href: "/proprietaires", label: "Propriétaires", icon: User },
] as const;
