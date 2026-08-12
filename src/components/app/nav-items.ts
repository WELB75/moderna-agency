import { LayoutDashboard, Wallet, ClipboardCheck, Building2, Wrench, ListTodo, User, Users, FileText, ShieldCheck, ChefHat, MessagesSquare, Bot } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/a-faire", label: "À faire", icon: ListTodo },
  { href: "/chat", label: "Messages", icon: MessagesSquare },
  { href: "/agent-ia", label: "Agent IA", icon: Bot },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/personnel", label: "Personnel", icon: ChefHat },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/securite", label: "Sécurité", icon: ShieldCheck },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/proprietaires", label: "Propriétaires", icon: User },
] as const;
