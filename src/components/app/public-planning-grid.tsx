"use client";

import { useState, useTransition } from "react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Select as SelectPrimitive } from "radix-ui";
import { Search, X, Loader2, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectContent, SelectItem } from "@/components/ui/select";
import {
  reassignPlanningAffectation,
  removePlanningAffectation,
  updatePlanningAffectationMoment,
  updatePlanningAffectationRepas,
} from "@/lib/actions/planning-public";
import { AddPlanningEntryDialog, type ReservationOption } from "@/components/app/add-planning-entry-dialog";
import { PublicStaffAvailability, type StaffAvailability } from "@/components/app/public-staff-availability";
import { PlanningInfoDuJour } from "@/components/app/planning-info-du-jour";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";

export type PublicPlanningEntry = {
  affectationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  villaType: "villa" | "appartement" | null;
  domaineNom: string | null;
  guestName: string;
  role: "menage" | "cuisine";
  moment: "sejour" | "depart" | "unique";
  personnelId: string;
  personnelNom: string;
  avecDejeuner: boolean;
  // Jusqu'à quand la mission court (fin de séjour) — pour l'affichage "Info du jour" (voir
  // planning-info-du-jour.tsx), qui doit dire "jusqu'au 13 sept." pour une cuisine ou un ménage
  // pendant le séjour, distinct du ménage de départ qui est toujours un jour unique.
  checkOut: Date;
};

type JourPlanning = { date: Date; entries: PublicPlanningEntry[] };
type Option = { id: string; nom: string };

// Grille éditable du lien public /planning/[token]. Kamel, 2026-08-08 : "le design est pas top,
// surtout sur mobile c pas adapté" — sur petit écran, empiler les 7 jours en pleine longueur
// forçait à scroller sans fin ; remplacé par un sélecteur de jour (pastilles horizontales) qui
// n'affiche qu'un seul jour à la fois. Le tableau 7 colonnes reste tel quel à partir de sm (assez
// de place). Les deux vues partagent les mêmes données, juste deux rendus différents.
//
// Kamel, 2026-08-09 : "je veux qu'on puisse trouver aussi les villa, les femmes de ménages [...]
// même les apparts" — la recherche filtre maintenant sur le nom du personnel, la villa/l'appart
// (nom, numéro, "villa"/"appartement") et le client, à la fois dans la grille et dans le panneau
// Personnel disponible (déplacé ici pour partager le même champ de recherche).
export function PublicPlanningGrid({
  jours,
  now,
  token,
  menageOptions,
  cuisineOptions,
  reservationOptions,
  staff,
}: {
  jours: JourPlanning[];
  now: Date;
  token: string;
  menageOptions: Option[];
  cuisineOptions: Option[];
  reservationOptions: ReservationOption[];
  staff: StaffAvailability[];
}) {
  const [recherche, setRecherche] = useState("");
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const indexAujourdhui = Math.max(
    0,
    jours.findIndex((j) => isSameDay(j.date, now))
  );
  const [jourActif, setJourActif] = useState(indexAujourdhui);
  const q = recherche.trim();

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
              placeholder="Chercher (nom, villa, appart...)"
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
                  placeholder="Nom, villa..."
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
                aria-label="Chercher"
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

      {/* Résumé en phrases du jour actuellement sélectionné (aujourd'hui par défaut, ou le jour
          cliqué dans la grille ci-dessous — pastilles mobile ou en-tête de colonne desktop).
          Kamel, 2026-08-10 : "si je clic sur mardi je veux aussi les infos de mardi". */}
      <PlanningInfoDuJour entries={jours[jourActif].entries} jour={jours[jourActif].date} now={now} />

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
        {jours.map((j, i) => (
          <JourCard
            key={j.date.toISOString()}
            jour={j}
            now={now}
            q={q}
            token={token}
            optionsPour={optionsPour}
            selected={i === jourActif}
            onSelect={() => setJourActif(i)}
          />
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Personnel disponible</h2>
        <PublicStaffAvailability staff={staff} query={q} />
      </div>
    </div>
  );
}

function entreeCorrespond(e: PublicPlanningEntry, q: string): boolean {
  const haystack = [
    e.personnelNom,
    e.villaNom ?? "",
    e.villaNumero ?? "",
    e.villaType ?? "",
    e.guestName,
    e.domaineNom ?? "",
  ].join(" ");
  return matchesSearch(haystack, q);
}

function JourCard({
  jour: { date, entries },
  now,
  q,
  token,
  optionsPour,
  pleineLargeur,
  selected,
  onSelect,
}: {
  jour: JourPlanning;
  now: Date;
  q: string;
  token: string;
  optionsPour: (role: "menage" | "cuisine") => Option[];
  pleineLargeur?: boolean;
  // Desktop uniquement : clic sur l'en-tête pour choisir le jour affiché dans le résumé
  // "Info du jour" au-dessus de la grille (voir PublicPlanningGrid). Absent en mobile où les
  // pastilles du haut jouent déjà ce rôle.
  selected?: boolean;
  onSelect?: () => void;
}) {
  const estAujourdhui = isSameDay(date, now);
  const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
  return (
    <Card className={cn("min-w-0", (estAujourdhui || selected) && !pleineLargeur && "border-foreground/40")}>
      <CardHeader className="pb-1.5">
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "flex items-center gap-1.5 text-left text-sm font-medium capitalize hover:underline",
              selected && "underline"
            )}
            title="Voir le résumé de ce jour"
          >
            {format(date, "EEEE d MMMM", { locale: fr })}
            {estAujourdhui ? <Badge>Aujourd&apos;hui</Badge> : null}
          </button>
        ) : (
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium capitalize">
            {format(date, "EEEE d MMMM", { locale: fr })}
            {estAujourdhui ? <Badge>Aujourd&apos;hui</Badge> : null}
          </CardTitle>
        )}
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

// Trigger de select compact réutilisé pour les 3 champs modifiables inline d'une mission
// (personne, moment du ménage, formule cuisine) — pas de troncature du texte (contrairement au
// <select> natif qu'il remplace) pour qu'on distingue toujours "Khadija MASLIK" de "Khadija
// KEJJAJI" sans avoir à ouvrir le menu.
function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} disabled={disabled} onValueChange={(v) => onChange(v as T)}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center justify-between gap-1 rounded-md border border-border/60 bg-background/70 py-0.5 pl-1.5 pr-1 text-left font-medium outline-none transition-colors hover:border-foreground/30 hover:bg-background focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
      >
        <SelectPrimitive.Value className="min-w-0 break-words whitespace-normal" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  );
}

const OPTIONS_MOMENT: { value: "depart" | "sejour"; label: string }[] = [
  { value: "depart", label: "Ménage de départ" },
  { value: "sejour", label: "Pendant le séjour" },
];
const OPTIONS_REPAS: { value: "non" | "oui"; label: string }[] = [
  { value: "non", label: "Petit-déj seul" },
  { value: "oui", label: "Petit-déj + déj" },
];

function EntryCard({ entry: e, token, options }: { entry: PublicPlanningEntry; token: string; options: Option[] }) {
  const [isPending, startTransition] = useTransition();

  function handlePersonnelChange(newPersonnelId: string) {
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

  function handleMomentChange(newMoment: "depart" | "sejour") {
    if (newMoment === e.moment) return;
    startTransition(async () => {
      try {
        await updatePlanningAffectationMoment(token, e.affectationId, newMoment);
        toast.success("Mis à jour.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleRepasChange(value: "non" | "oui") {
    const avecDejeuner = value === "oui";
    if (avecDejeuner === e.avecDejeuner) return;
    startTransition(async () => {
      try {
        await updatePlanningAffectationRepas(token, e.affectationId, avecDejeuner);
        toast.success("Mis à jour.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removePlanningAffectation(token, e.affectationId);
        toast.success(`${e.personnelNom} retirée du planning.`);
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
        <InlineSelect
          value={e.personnelId}
          options={options.map((o) => ({ value: o.id, label: o.nom }))}
          onChange={handlePersonnelChange}
          disabled={isPending}
          className="text-sm sm:text-xs"
        />
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Retirer ${e.personnelNom}`}
          title="Retirer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-muted-foreground" title={e.domaineNom ?? undefined}>
        {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName}
      </p>
      {e.role === "cuisine" ? (
        <InlineSelect
          value={e.avecDejeuner ? "oui" : "non"}
          options={OPTIONS_REPAS}
          onChange={handleRepasChange}
          disabled={isPending}
          className="text-[11px] text-muted-foreground"
        />
      ) : (
        <InlineSelect
          value={e.moment === "sejour" ? "sejour" : "depart"}
          options={OPTIONS_MOMENT}
          onChange={handleMomentChange}
          disabled={isPending}
          className="text-[11px] text-muted-foreground"
        />
      )}
    </div>
  );
}
