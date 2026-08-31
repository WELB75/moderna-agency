import { LayoutDashboard, Wallet, ClipboardCheck, Building2, Wrench, ListTodo, User, Users, FileText, ShieldCheck, ChefHat, MessagesSquare, Bot, CalendarClock, BarChart3 } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/a-faire", label: "À faire", icon: ListTodo },
  { href: "/chat", label: "Messages", icon: MessagesSquare },
  { href: "/agent-ia", label: "Agent IA", icon: Bot },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/personnel", label: "Personnel", icon: ChefHat },
  { href: "/personnel?onglet=planning", label: "Planning", icon: CalendarClock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/securite", label: "Sécurité", icon: ShieldCheck },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/statistiques", label: "Statistiques", icon: BarChart3 },
  { href: "/proprietaires", label: "Propriétaires", icon: User },
] as const;

// Personnel et Planning pointent tous deux vers /personnel (onglets différents) : le simple
// pathname ne suffit pas à distinguer lequel est "actif" dans la nav — il faut aussi comparer
// le paramètre ?onglet=.
export function isNavItemActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [itemPath, itemQuery] = href.split("?");
  if (itemQuery) {
    if (pathname !== itemPath) return false;
    const wanted = new URLSearchParams(itemQuery);
    return [...wanted.entries()].every(([key, value]) => searchParams.get(key) === value);
  }
  if (pathname !== itemPath && !pathname.startsWith(itemPath + "/")) return false;
  // Cas Personnel (sans query) vs Planning (?onglet=planning) : Personnel ne doit pas rester
  // actif quand on est en réalité sur l'onglet Planning.
  if (itemPath === "/personnel" && searchParams.get("onglet") === "planning") return false;
  return true;
}
