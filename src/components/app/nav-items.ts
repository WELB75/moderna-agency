import {
  LayoutDashboard,
  Wallet,
  ClipboardCheck,
  Building2,
  Wrench,
  User,
  Users,
  FileText,
  ShieldCheck,
  ChefHat,
  MessagesSquare,
  CalendarPlus,
  BarChart3,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Menu regroupé en 3 sections, sur le modèle de SuperHote v2 ("Au quotidien",
// "Communication & opérations", "Croissance & outils") — mêmes pages qu'avant, seulement
// rangées par usage. Boîte de réception/Agent IA restent des onglets de "Messages" (/chat) et
// Planning un onglet de "Personnel".
export const navGroups: NavGroup[] = [
  {
    label: "Au quotidien",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
      { href: "/reservations/nouvelle", label: "Nouvelle réservation", icon: CalendarPlus },
      { href: "/villas", label: "Hébergements", icon: Building2 },
      { href: "/personnel", label: "Ménages et équipe", icon: ChefHat },
      { href: "/caisse", label: "Caisse", icon: Wallet },
    ],
  },
  {
    label: "Communication & opérations",
    items: [
      { href: "/chat", label: "Messages", icon: MessagesSquare },
      { href: "/inventaire", label: "États des lieux", icon: ClipboardCheck },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/securite", label: "Sécurité", icon: ShieldCheck },
      { href: "/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Croissance & outils",
    items: [
      { href: "/statistiques", label: "Statistiques", icon: BarChart3 },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/proprietaires", label: "Propriétaires", icon: User },
    ],
  },
];

// Liste à plat (grille de raccourcis mobile, recherche du titre de page…).
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

// Les 4 entrées visibles en permanence dans la barre du bas sur téléphone ; le reste passe
// dans "Plus".
export const mobilePrimaryHrefs = ["/dashboard", "/calendrier", "/chat", "/villas"];

export function isNavItemActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [itemPath, itemQuery] = href.split("?");
  if (itemQuery) {
    if (pathname !== itemPath) return false;
    const wanted = new URLSearchParams(itemQuery);
    return [...wanted.entries()].every(([key, value]) => searchParams.get(key) === value);
  }
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

// Titre affiché dans l'en-tête (façon SuperHote : "Calendrier", "Réservations"…) à partir de
// l'URL courante — la plus longue correspondance gagne (/reservations/nouvelle avant /reservations).
export function pageTitleFor(pathname: string): string | null {
  const match = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.label;
  if (pathname.startsWith("/reservations")) return "Réservations";
  if (pathname.startsWith("/contrats")) return "Contrats";
  if (pathname.startsWith("/gendarmerie")) return "Fiche police";
  if (pathname.startsWith("/interventions")) return "Interventions";
  if (pathname.startsWith("/appartements")) return "Appartements";
  if (pathname.startsWith("/a-faire")) return "À faire";
  return null;
}
