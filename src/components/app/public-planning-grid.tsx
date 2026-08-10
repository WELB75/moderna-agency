"use client";

import { useState, useTransition } from "react";
import { format, isSameDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Select as SelectPrimitive } from "radix-ui";
import { Search, X, Loader2, ChevronDown, MessageCircle, Check } from "lucide-react";
import { SelectContent, SelectItem } from "@/components/ui/select";
import {
  reassignPlanningAffectation,
  removePlanningAffectation,
  updatePlanningAffectationMoment,
  updatePlanningAffectationRepas,
  togglePlanningAffectationConfirme,
} from "@/lib/actions/planning-public";
import { AddPlanningEntryDialog, type ReservationOption } from "@/components/app/add-planning-entry-dialog";
import { PublicStaffAvailability, type StaffAvailability } from "@/components/app/public-staff-availability";
import { PlanningInfoDuJour } from "@/components/app/planning-info-du-jour";
import { matchesSearch } from "@/lib/text-match";
import { toWhatsAppUrl } from "@/lib/phone";
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
  telephone: string | null;
  avecDejeuner: boolean;
  // Coché quand la personne a été contactée/confirmée pour cette mission (typiquement la veille) —
  // voir confirmeAt dans db/schema.ts.
  confirmeAt: Date | null;
  // Jusqu'à quand la mission court (fin de séjour) — pour l'affichage "Info du jour" (voir
  // planning-info-du-jour.tsx), qui doit dire "jusqu'au 13 sept." pour une cuisine ou un ménage
  // pendant le séjour, distinct du ménage de départ qui est toujours un jour unique.
  checkOut: Date;
};

type JourPlanning = { date: Date; entries: PublicPlanningEntry[] };
type Option = { id: string; nom: string };

// Grille éditable du lien public /planning/[token]. Kamel, 2026-08-10 : "je veux tout sur une
// ligne chaque jour [...] Lundi : ligne de femme de ménage et en dessous ligne de cuisinière
// [...] on a même pas à descendre on a déjà toutes les infos de la journée" — remplace l'ancien
// découpage mobile (un jour à la fois, pastilles de navigation) / desktop (7 colonnes, une carte
// empilée par mission) par UNE seule mise en page : chaque jour est un bloc compact de 2 lignes
// (ménage, cuisine) où les missions sont des pastilles qui s'enchaînent et passent à la ligne
// seulement si besoin — toute la semaine tient sans avoir à cliquer/scroller jour par jour, sur
// mobile comme sur desktop.
//
// Kamel, 2026-08-09 : "je veux qu'on puisse trouver aussi les villa, les femmes de ménages [...]
// même les apparts" — la recherche filtre sur le nom du personnel, la villa/l'appart (nom,
// numéro, "villa"/"appartement") et le client, à la fois dans la grille et dans le panneau
// Personnel disponible (qui partage le même champ de recherche).
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
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-amber-500/70 bg-amber-500/20" />
            À confirmer pour demain
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

      {/* Résumé en phrases du jour sélectionné (cliquer une date dans la grille ci-dessous en
          change) — Kamel, 2026-08-10 : "si je clic sur mardi je veux aussi les infos de mardi". */}
      <PlanningInfoDuJour entries={jours[jourActif].entries} jour={jours[jourActif].date} now={now} />

      <div className="space-y-2">
        {jours.map((j, i) => (
          <JourRow
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

function JourRow({
  jour: { date, entries },
  now,
  q,
  token,
  optionsPour,
  selected,
  onSelect,
}: {
  jour: JourPlanning;
  now: Date;
  q: string;
  token: string;
  optionsPour: (role: "menage" | "cuisine") => Option[];
  selected: boolean;
  onSelect: () => void;
}) {
  const estAujourdhui = isSameDay(date, now);
  const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
  const menage = filtrees.filter((e) => e.role === "menage");
  const cuisine = filtrees.filter((e) => e.role === "cuisine");

  return (
    <div className={cn("min-w-0 rounded-lg border p-2.5", selected && "border-foreground/40 bg-muted/20")}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "mb-1.5 text-left text-sm font-medium capitalize hover:underline",
          selected && "underline",
          estAujourdhui && "rounded border border-foreground px-1.5 py-0.5"
        )}
        title="Voir le résumé de ce jour"
      >
        {format(date, "EEEE d MMMM", { locale: fr })}
      </button>

      {q && filtrees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun résultat.</p>
      ) : (
        <div className="space-y-1">
          <MissionLigne label="Ménage" entries={menage} token={token} options={optionsPour("menage")} jour={date} now={now} />
          <MissionLigne label="Cuisine" entries={cuisine} token={token} options={optionsPour("cuisine")} jour={date} now={now} />
        </div>
      )}
    </div>
  );
}

function MissionLigne({
  label,
  entries,
  token,
  options,
  jour,
  now,
}: {
  label: string;
  entries: PublicPlanningEntry[];
  token: string;
  options: Option[];
  jour: Date;
  now: Date;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-14 shrink-0 pt-1 text-[11px] font-medium text-muted-foreground">{label}</span>
      {entries.length === 0 ? (
        <span className="pt-1 text-xs text-muted-foreground">—</span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {entries.map((e) => (
            <MissionChip key={e.affectationId} entry={e} token={token} options={options} jour={jour} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

// Trigger de select compact réutilisé pour les 2 champs modifiables inline d'une mission
// (personne, moment du ménage/formule cuisine) — pas de troncature du texte (contrairement au
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
          "flex w-fit min-w-0 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded border-none bg-transparent p-0 text-left font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
      >
        <SelectPrimitive.Value className="whitespace-nowrap" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
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
  { value: "depart", label: "Départ" },
  { value: "sejour", label: "Séjour" },
];
const OPTIONS_REPAS: { value: "non" | "oui"; label: string }[] = [
  { value: "non", label: "P-déj seul" },
  { value: "oui", label: "P-déj + déj" },
];

// Une mission = une pastille compacte tenant sur une seule ligne (nom, villa/client, détail,
// retirer) — plusieurs pastilles s'enchaînent horizontalement et ne passent à la ligne que
// lorsque la largeur manque (voir MissionLigne), au lieu de l'ancienne carte pleine largeur
// empilée verticalement par jour.
function MissionChip({
  entry: e,
  token,
  options,
  jour,
  now,
}: {
  entry: PublicPlanningEntry;
  token: string;
  options: Option[];
  jour: Date;
  now: Date;
}) {
  const [isPending, startTransition] = useTransition();
  // Kamel, 2026-08-10 : "savoir aussi si par exemple celle prévue demain on valide la veille" —
  // le rappel visuel ne compte que pour demain (pas toute la semaine), c'est le seul moment où
  // "pas encore confirmé" est vraiment urgent.
  const estDemain = isSameDay(jour, addDays(now, 1));
  const aConfirmer = estDemain && !e.confirmeAt;

  function handleToggleConfirme() {
    startTransition(async () => {
      try {
        await togglePlanningAffectationConfirme(token, e.affectationId, !e.confirmeAt);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

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
        "inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border-l-4 bg-muted/40 py-1 pl-2 pr-1 text-xs",
        e.role === "menage" ? "border-l-orange-500" : "border-l-violet-500",
        aConfirmer && "ring-1 ring-amber-500/70 bg-amber-500/10"
      )}
    >
      {isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      {e.telephone ? (
        <a
          href={toWhatsAppUrl(e.telephone)}
          target="_blank"
          rel="noreferrer"
          title={e.telephone}
          aria-label={`WhatsApp ${e.personnelNom}`}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-emerald-600 hover:bg-background dark:text-emerald-400"
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      ) : null}
      <InlineSelect
        value={e.personnelId}
        options={options.map((o) => ({ value: o.id, label: o.nom }))}
        onChange={handlePersonnelChange}
        disabled={isPending}
        className="font-semibold"
      />
      <span className="text-muted-foreground" title={e.domaineNom ?? undefined}>
        · {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName} ·
      </span>
      {e.role === "cuisine" ? (
        <InlineSelect value={e.avecDejeuner ? "oui" : "non"} options={OPTIONS_REPAS} onChange={handleRepasChange} disabled={isPending} className="text-muted-foreground" />
      ) : (
        <InlineSelect value={e.moment === "sejour" ? "sejour" : "depart"} options={OPTIONS_MOMENT} onChange={handleMomentChange} disabled={isPending} className="text-muted-foreground" />
      )}
      <button
        type="button"
        onClick={handleToggleConfirme}
        disabled={isPending}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          e.confirmeAt
            ? "text-emerald-600 hover:bg-background dark:text-emerald-400"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        )}
        aria-label={e.confirmeAt ? `Annuler la confirmation de ${e.personnelNom}` : `Confirmer ${e.personnelNom}`}
        title={e.confirmeAt ? `Confirmée le ${format(e.confirmeAt, "d MMM HH:mm", { locale: fr })}` : "Pas encore confirmée — cliquer une fois la personne contactée"}
      >
        <Check className="h-3 w-3" strokeWidth={e.confirmeAt ? 3 : 2} />
      </button>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label={`Retirer ${e.personnelNom}`}
        title="Retirer"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
