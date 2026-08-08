"use client";

import { useState, useTransition } from "react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Search, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { reassignPlanningAffectation } from "@/lib/actions/planning-public";
import { cn } from "@/lib/utils";

export type PublicPlanningEntry = {
  affectationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  guestName: string;
  role: "menage" | "cuisine";
  moment: "sejour" | "depart" | "unique";
  personnelId: string;
  personnelNom: string;
  avecDejeuner: boolean;
};

type JourPlanning = { date: Date; entries: PublicPlanningEntry[] };
type Option = { id: string; nom: string };

// Grille éditable du lien public /planning/[token] — même principe visuel que la grille interne
// (PersonnelPlanningGrid) mais chaque nom est un sélecteur direct plutôt qu'un bouton "retirer" :
// Kamel, 2026-08-08 : "on peut le modifier, ça veut dire qu'on peut changer le nom dessus
// directement". Réaffecte en un seul choix, sans connexion (jeton vérifié côté action).
export function PublicPlanningGrid({
  jours,
  now,
  token,
  menageOptions,
  cuisineOptions,
}: {
  jours: JourPlanning[];
  now: Date;
  token: string;
  menageOptions: Option[];
  cuisineOptions: Option[];
}) {
  const [recherche, setRecherche] = useState("");
  const q = recherche.trim().toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
            Femme de ménage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
            Cuisinière
          </span>
        </div>

        <div className="relative w-full max-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un prénom..."
            className="w-full border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          />
          {recherche ? (
            <button
              type="button"
              onClick={() => setRecherche("")}
              aria-label="Effacer"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-7">
        {jours.map(({ date, entries }) => {
          const estAujourdhui = isSameDay(date, now);
          const filtrees = q ? entries.filter((e) => e.personnelNom.toLowerCase().includes(q)) : entries;
          return (
            <Card key={date.toISOString()} className={cn(estAujourdhui && "border-foreground/40")}>
              <CardHeader className="pb-1.5">
                <CardTitle className="text-sm font-medium capitalize">
                  {format(date, "EEE d MMM", { locale: fr })}
                  {estAujourdhui ? <Badge className="ml-1.5">Aujourd&apos;hui</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {filtrees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{q ? "Aucun résultat." : "Rien de prévu."}</p>
                ) : (
                  filtrees.map((e) => (
                    <EntryCard key={e.affectationId} entry={e} token={token} options={e.role === "menage" ? menageOptions : cuisineOptions} />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EntryCard({ entry: e, token, options }: { entry: PublicPlanningEntry; token: string; options: Option[] }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(newPersonnelId: string) {
    if (newPersonnelId === e.personnelId) return;
    startTransition(async () => {
      try {
        await reassignPlanningAffectation(token, e.affectationId, newPersonnelId);
        toast.success("Réaffecté.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div
      className={cn(
        "space-y-0.5 rounded-md border-l-4 bg-muted/40 py-1 pl-2 pr-1.5 text-xs",
        e.role === "menage" ? "border-l-orange-500" : "border-l-violet-500"
      )}
    >
      <div className="flex items-center gap-1">
        {isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
        <select
          value={e.personnelId}
          disabled={isPending}
          onChange={(ev) => handleChange(ev.target.value)}
          className="w-full min-w-0 cursor-pointer truncate border-none bg-transparent p-0 text-xs font-medium outline-none disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </select>
      </div>
      <p className="truncate text-muted-foreground" title={e.domaineNom ?? undefined}>
        {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName}
      </p>
      <p className="text-muted-foreground">
        {e.role === "cuisine"
          ? e.avecDejeuner
            ? "Petit-déj + déj"
            : "Petit-déj seul"
          : e.moment === "sejour"
            ? "Pendant le séjour"
            : "Ménage de départ"}
      </p>
    </div>
  );
}
