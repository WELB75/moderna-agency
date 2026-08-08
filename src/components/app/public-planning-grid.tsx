"use client";

import { useState, useTransition } from "react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Search, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { reassignPlanningAffectation } from "@/lib/actions/planning-public";
import { AddPlanningEntryDialog, type ReservationOption } from "@/components/app/add-planning-entry-dialog";
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

// Grille éditable du lien public /planning/[token]. Kamel, 2026-08-08 : "le design est pas top,
// surtout sur mobile c pas adapté" — sur petit écran, empiler les 7 jours en pleine longueur
// forçait à scroller sans fin ; remplacé par un sélecteur de jour (pastilles horizontales) qui
// n'affiche qu'un seul jour à la fois. Le tableau 7 colonnes reste tel quel à partir de sm (assez
// de place). Les deux vues partagent les mêmes données, juste deux rendus différents.
export function PublicPlanningGrid({
  jours,
  now,
  token,
  menageOptions,
  cuisineOptions,
  reservationOptions,
}: {
  jours: JourPlanning[];
  now: Date;
  token: string;
  menageOptions: Option[];
  cuisineOptions: Option[];
  reservationOptions: ReservationOption[];
}) {
  const [recherche, setRecherche] = useState("");
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const indexAujourdhui = Math.max(
    0,
    jours.findIndex((j) => isSameDay(j.date, now))
  );
  const [jourActif, setJourActif] = useState(indexAujourdhui);
  const q = recherche.trim().toLowerCase();

  const optionsPour = (role: "menage" | "cuisine") => (role === "menage" ? menageOptions : cuisineOptions);

  return (
    <div className="min-w-0 space-y-3">
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

        <div className="flex items-center gap-2">
          {/* Desktop : champ toujours visible */}
          <div className="relative hidden w-full max-w-56 min-w-0 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un prénom..."
              className="w-full min-w-0 border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
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

          {/* Mobile : juste la loupe, qui déplie le champ au clic — Kamel, 2026-08-08 :
              "juste une loupe s'il te plaît" */}
          <div className="sm:hidden">
            {rechercheOuverte ? (
              <div className="relative w-36 min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  onBlur={() => {
                    if (!recherche) setRechercheOuverte(false);
                  }}
                  placeholder="Prénom..."
                  className="w-full min-w-0 border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    setRecherche("");
                    setRechercheOuverte(false);
                  }}
                  aria-label="Fermer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRechercheOuverte(true)}
                aria-label="Chercher un prénom"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>

          <AddPlanningEntryDialog
            token={token}
            reservations={reservationOptions}
            menageOptions={menageOptions}
            cuisineOptions={cuisineOptions}
          />
        </div>
      </div>

      {/* ---------- Mobile : un jour à la fois ---------- */}
      <div className="min-w-0 space-y-3 sm:hidden">
        <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
          {jours.map((j, i) => {
            const estAujourdhui = isSameDay(j.date, now);
            return (
              <button
                key={j.date.toISOString()}
                type="button"
                onClick={() => setJourActif(i)}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 text-xs capitalize",
                  i === jourActif ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
                  estAujourdhui && i !== jourActif && "border-foreground/50 text-foreground"
                )}
              >
                <span>{format(j.date, "EEE", { locale: fr })}</span>
                <span className="font-semibold">{format(j.date, "d")}</span>
              </button>
            );
          })}
        </div>

        <JourCard jour={jours[jourActif]} now={now} q={q} token={token} optionsPour={optionsPour} pleineLargeur />
      </div>

      {/* ---------- Desktop : semaine entière ---------- */}
      <div className="hidden gap-2.5 sm:grid sm:grid-cols-7">
        {jours.map((j) => (
          <JourCard key={j.date.toISOString()} jour={j} now={now} q={q} token={token} optionsPour={optionsPour} />
        ))}
      </div>
    </div>
  );
}

function JourCard({
  jour: { date, entries },
  now,
  q,
  token,
  optionsPour,
  pleineLargeur,
}: {
  jour: JourPlanning;
  now: Date;
  q: string;
  token: string;
  optionsPour: (role: "menage" | "cuisine") => Option[];
  pleineLargeur?: boolean;
}) {
  const estAujourdhui = isSameDay(date, now);
  const filtrees = q ? entries.filter((e) => e.personnelNom.toLowerCase().includes(q)) : entries;
  return (
    <Card className={cn("min-w-0", estAujourdhui && !pleineLargeur && "border-foreground/40")}>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-sm font-medium capitalize">
          {format(date, "EEEE d MMMM", { locale: fr })}
          {estAujourdhui ? <Badge className="ml-1.5">Aujourd&apos;hui</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {filtrees.length === 0 ? (
          <p className="text-xs text-muted-foreground">{q ? "Aucun résultat." : "Rien de prévu."}</p>
        ) : (
          filtrees.map((e) => <EntryCard key={e.affectationId} entry={e} token={token} options={optionsPour(e.role)} />)
        )}
      </CardContent>
    </Card>
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
        "min-w-0 space-y-0.5 rounded-md border-l-4 bg-muted/40 py-1.5 pl-2 pr-1.5 text-xs",
        e.role === "menage" ? "border-l-orange-500" : "border-l-violet-500"
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        {isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
        <select
          value={e.personnelId}
          disabled={isPending}
          onChange={(ev) => handleChange(ev.target.value)}
          className="w-full min-w-0 cursor-pointer truncate border-none bg-transparent p-0 text-sm font-medium outline-none disabled:opacity-60 sm:text-xs"
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
