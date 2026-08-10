import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PublicPlanningEntry } from "@/components/app/public-planning-grid";

// Résumé "qui est où aujourd'hui", en phrases, par personne — Kamel, 2026-08-10 : "Il faut que
// quand on aille sur le planning est des infos clair tenant sans regarder le planning [...]
// touria est a noria, ménage depart : mima cosy [...] khaoula est a moderna 2, cuisine jusqu'au
// 13.09". La grille semaine par semaine reste en dessous pour le détail/la modification ; ce
// bloc est juste la lecture rapide du jour, sans avoir à scanner la grille.
export function PlanningInfoDuJour({ entries, now }: { entries: PublicPlanningEntry[]; now: Date }) {
  const parPersonne = new Map<string, { nom: string; entries: PublicPlanningEntry[] }>();
  for (const e of entries) {
    const groupe = parPersonne.get(e.personnelId) ?? { nom: e.personnelNom, entries: [] };
    groupe.entries.push(e);
    parPersonne.set(e.personnelId, groupe);
  }
  const personnes = Array.from(parPersonne.values()).sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base capitalize">Aujourd&apos;hui — {format(now, "EEEE d MMMM", { locale: fr })}</CardTitle>
      </CardHeader>
      <CardContent>
        {personnes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Personne affectée aujourd&apos;hui.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {personnes.map((p) => (
              <li key={p.nom} className={cn("border-l-4 pl-2.5", p.entries[0].role === "menage" ? "border-l-orange-500" : "border-l-violet-500")}>
                <span className="font-medium">{p.nom}</span>{" "}
                {p.entries.map((e, i) => (
                  <span key={e.affectationId}>
                    {i > 0 ? " et " : ""}
                    {phraseMission(e, now)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function phraseMission(e: PublicPlanningEntry, now: Date): string {
  const domaine = e.domaineNom ?? "domaine non renseigné";
  const villa = e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "villa non renseignée";
  const jusquau = !isSameDay(e.checkOut, now) ? `, jusqu'au ${format(e.checkOut, "d MMM", { locale: fr })}` : "";

  if (e.role === "menage") {
    const mission = e.moment === "sejour" ? "ménage (pendant le séjour)" : "ménage de départ";
    return `est à ${domaine}, ${mission} : ${villa}${e.moment === "sejour" ? jusquau : ""}`;
  }
  const repas = e.avecDejeuner ? "petit-déj + déj" : "petit-déj seul";
  return `est à ${domaine}, cuisine (${repas}) : ${villa}${jusquau}`;
}
