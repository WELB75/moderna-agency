import { MessageCircle } from "lucide-react";
import { toWhatsAppUrl } from "@/lib/phone";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";

export type StaffAvailability = {
  id: string;
  nom: string;
  telephone: string | null;
  role: "menage" | "cuisine";
  occupeAujourdhui: boolean;
};

type StaffMerged = {
  id: string;
  nom: string;
  telephone: string | null;
  roles: Set<"menage" | "cuisine">;
  occupeAujourdhui: boolean;
};

function initiale(nom: string): string {
  return nom.trim().charAt(0).toUpperCase() || "?";
}

// Panneau "qui est libre, comment la joindre" sous le planning du lien public — Kamel,
// 2026-08-08 : "en un seul clic qu'on a le WhatsApp on peut la contacter". Le badge
// libre/occupée reflète uniquement aujourd'hui — quelqu'un d'occupé aujourd'hui reste contactable
// pour une mission plus tard dans la semaine.
//
// Kamel, 2026-08-09 : partage le même champ de recherche que la grille du planning (voir
// PublicPlanningGrid) pour retrouver une femme de ménage/cuisinière par son prénom sans avoir à
// scroller toute la liste.
//
// Kamel, 2026-08-10 (le patron) : "en bas les contact whatsapp fais un seul bloc avec les badges
// [...] comme ca on voit pas deux fois les memes prenoms" — une personne qui fait les deux
// métiers a 2 fiches personnel distinctes en base (une par rôle, voir personnel.role dans
// db/schema.ts), donc regroupé ici par nom en une seule pastille par personne.
//
// Refonte 2026-08-28 (identité visuelle) : carte plate remplacée par des "fiches contact" avec
// avatar à initiale — même langage visuel que les lignes du planning ci-dessus (voir
// public-planning-grid.tsx). Ne réutilise plus le composant Card partagé, câblé sur --radius:0
// pour rester cohérent avec le reste de l'app.
export function PublicStaffAvailability({ staff, query = "" }: { staff: StaffAvailability[]; query?: string }) {
  const parNom = new Map<string, StaffMerged>();
  for (const s of staff) {
    const existant = parNom.get(s.nom);
    if (existant) {
      existant.roles.add(s.role);
      existant.telephone ??= s.telephone;
      existant.occupeAujourdhui ||= s.occupeAujourdhui;
    } else {
      parNom.set(s.nom, { id: s.id, nom: s.nom, telephone: s.telephone, roles: new Set([s.role]), occupeAujourdhui: s.occupeAujourdhui });
    }
  }
  // Kamel, 2026-08-10 : "toutes les personnes libres en premier [...] et toutes les personnes
  // occupées [...] toujours à la fin" — tri par disponibilité d'abord, nom en ordre alphabétique
  // ensuite dans chaque groupe.
  const personnes = [...parNom.values()].sort((a, b) => {
    if (a.occupeAujourdhui !== b.occupeAujourdhui) return a.occupeAujourdhui ? 1 : -1;
    return a.nom.localeCompare(b.nom);
  });
  const filtrees = query ? personnes.filter((p) => matchesSearch(p.nom, query)) : personnes;

  return (
    <div className="rounded-[20px] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] sm:p-4 dark:bg-white/[0.03] dark:ring-white/[0.06]">
      {filtrees.length === 0 ? (
        <p className="text-xs text-muted-foreground">{query ? "Aucun résultat." : "Personne d'actif pour l'instant."}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {filtrees.map((p) => (
            <div
              key={p.id}
              className="flex shrink-0 items-center gap-2 rounded-full bg-black/[0.025] py-1 pl-1 pr-2.5 dark:bg-white/[0.04]"
            >
              <div className="relative shrink-0">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    p.roles.has("menage") && !p.roles.has("cuisine") && "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
                    p.roles.has("cuisine") && !p.roles.has("menage") && "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
                    p.roles.has("menage") && p.roles.has("cuisine") && "bg-gradient-to-br from-orange-100 to-violet-100 text-foreground dark:from-orange-500/15 dark:to-violet-500/15"
                  )}
                >
                  {initiale(p.nom)}
                </div>
                <span
                  className={cn(
                    "absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#1e1e1e]",
                    p.occupeAujourdhui ? "bg-red-500" : "bg-emerald-500"
                  )}
                  aria-hidden
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-semibold">{p.nom}</span>
                <span className={cn("text-[10px] font-medium", p.occupeAujourdhui ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {p.occupeAujourdhui ? "Occupée" : "Libre"}
                </span>
              </div>
              {p.telephone ? (
                <a
                  href={toWhatsAppUrl(p.telephone)}
                  target="_blank"
                  rel="noreferrer"
                  title={p.telephone}
                  aria-label={`WhatsApp ${p.nom}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
