import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
// db/schema.ts), donc regroupé ici par nom en une seule pastille par personne, avec un badge M
// et/ou C selon ses rôles (même langage visuel que la grille du planning ci-dessus).
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
  const personnes = [...parNom.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  const filtrees = query ? personnes.filter((p) => matchesSearch(p.nom, query)) : personnes;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Personnel</CardTitle>
      </CardHeader>
      <CardContent>
        {filtrees.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {query ? "Aucun résultat." : "Personne d'actif pour l'instant."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filtrees.map((p) => (
              <div
                key={p.id}
                className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/30 py-1 pl-1.5 pr-1 text-xs"
              >
                {p.roles.has("menage") ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                    M
                  </span>
                ) : null}
                {p.roles.has("cuisine") ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
                    C
                  </span>
                ) : null}
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.occupeAujourdhui ? "bg-red-500" : "bg-green-500")}
                  aria-hidden
                />
                <span className="font-medium">{p.nom}</span>
                <span className={cn("text-[10px]", p.occupeAujourdhui ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                  {p.occupeAujourdhui ? "Occupée" : "Libre"}
                </span>
                {p.telephone ? (
                  <a
                    href={toWhatsAppUrl(p.telephone)}
                    target="_blank"
                    rel="noreferrer"
                    title={p.telephone}
                    aria-label={`WhatsApp ${p.nom}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                  >
                    <MessageCircle className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
