import { LayoutDashboard, Wallet, ClipboardCheck, Building2, Wrench, User, Users, FileText, ShieldCheck, ChefHat, MessagesSquare, CalendarPlus, BarChart3, Calendar } from "lucide-react";

// Boîte de réception, Agent IA et Planning n'ont plus leur propre entrée : la Boîte de réception
// et l'Agent IA vivent maintenant comme onglets internes de "Messages" (/chat), et Planning comme
// onglet interne de "Personnel" (/personnel?onglet=planning) — un seul l'affichait déjà, l'autre
// faisait doublon dans le menu. Kamel, 2026-09-29 : "on allege les onglets là".
export const navItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/reservations/nouvelle", label: "Nouvelle réservation", icon: CalendarPlus },
  { href: "/chat", label: "Messages", icon: MessagesSquare },
  { href: "/villas", label: "Villas", icon: Building2 },
  { href: "/inventaire", label: "Inventaire", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/personnel", label: "Personnel", icon: ChefHat },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/securite", label: "Sécurité", icon: ShieldCheck },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/statistiques", label: "Statistiques", icon: BarChart3 },
  { href: "/calendrier", label: "Calendrier", icon: Calendar },
  { href: "/proprietaires", label: "Propriétaires", icon: User },
] as const;

export function isNavItemActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [itemPath, itemQuery] = href.split("?");
  if (itemQuery) {
    if (pathname !== itemPath) return false;
    const wanted = new URLSearchParams(itemQuery);
    return [...wanted.entries()].every(([key, value]) => searchParams.get(key) === value);
  }
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}
