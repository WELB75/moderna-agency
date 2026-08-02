import { LayoutDashboard, Wallet, ClipboardCheck, Building2, Wrench, ListTodo, ShoppingCart, User, Users, Gauge, FileText, ShieldCheck, ChefHat, MessagesSquare } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/a-faire", label: "À faire", icon: ListTodo },
  { href: "/chat", label: "Messages", icon: MessagesSquare },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/interventions", label: "Interventions", icon: Gauge },
  { href: "/personnel", label: "Personnel", icon: ChefHat },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/securite", label: "Sécurité", icon: ShieldCheck },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/courses", label: "Courses", icon: ShoppingCart },
  { href: "/proprietaires", label: "Propriétaires", icon: User },
] as const;
