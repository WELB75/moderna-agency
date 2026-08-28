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
};

type JourPlanning = { date: Date; entries: PublicPlanningEntry[] };
type Option = { id: string; nom: string };

// Grille éditable du lien public /planning/[token]. Historique des demandes qui ont façonné
// cette page (toutes conservées dans les refontes ci-dessous) :
// - "je veux tout sur une ligne chaque jour [...] on a même pas à descendre" : toute la semaine
//   reste visible en une seule colonne verticale, sans navigation jour par jour ni clic pour
//   dérouler.
// - "deux badges avec couleurs distinctes M (Ménage) et C (Cuisine)" : conservé.
// - "je tape un prénom [...] même les appart" : recherche multi-champs conservée.
// - "en un seul clic qu'on a le WhatsApp" : conservé.
//
// Refonte 2026-08-28 (structure) : pastille à une seule ligne remplacée par une ligne en grille
// stable (badge · contenu sur 2 lignes · actions) pour ne plus dépendre d'un repli imprévisible.
//
// Refonte 2026-08-28 (identité visuelle) — Kamel : "trop complexe [...] design et logique adapté
// [...] nouvelle identité pour cette page" — cette page est vue par le personnel (pas seulement
// par l'admin), contrairement au reste de l'app qui garde volontairement une charte plate et
// stricte monochrome (voir globals.css). Ici seulement : fond crème chaleureux, cartes arrondies
// avec un léger relief, avatars à initiales colorées par métier. Les rayons utilisent des valeurs
// arbitraires (rounded-[..px]) plutôt que l'échelle rounded-lg/xl/2xl de l'app, qui reste câblée
// sur --radius:0 partout ailleurs — voler cette échelle ici casserait le reste de l'app.
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
  const q = recherche.trim();

  const optionsPour = (role: "menage" | "cuisine") => (role === "menage" ? menageOptions : cuisineOptions);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="orange">M · Femme de ménage</LegendChip>
          <LegendChip color="violet">C · Cuisinière</LegendChip>
          <LegendChip color="amber">À confirmer pour demain</LegendChip>
        </div>

        <div className="flex items-center gap-2">
          {/* Desktop : champ toujours visible */}
          <div className="relative hidden w-full max-w-56 min-w-0 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher (nom, villa, appart...)"
              className="w-full min-w-0 rounded-full border border-black/[0.06] bg-white py-1.5 pl-8 pr-7 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground focus:border-orange-300 dark:border-white/[0.06] dark:bg-white/[0.04]"
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
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  onBlur={() => {
                    if (!recherche) setRechercheOuverte(false);
                  }}
                  placeholder="Nom, villa..."
                  className="w-full min-w-0 rounded-full border border-black/[0.06] bg-white py-1.5 pl-8 pr-7 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground focus:border-orange-300 dark:border-white/[0.06] dark:bg-white/[0.04]"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:text-foreground dark:border-white/[0.06] dark:bg-white/[0.04]"
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

      <div className="space-y-3">
        {jours.map((j) => (
          <DayCard key={j.date.toISOString()} jour={j} now={now} q={q} token={token} optionsPour={optionsPour} />
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Personnel disponible</h2>
        <PublicStaffAvailability staff={staff} query={q} />
      </div>
    </div>
  );
}

function LegendChip({ color, children }: { color: "orange" | "violet" | "amber"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        color === "orange" && "bg-orange-500/10 text-orange-700 dark:text-orange-300",
        color === "violet" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
        color === "amber" && "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          color === "orange" && "bg-orange-500",
          color === "violet" && "bg-violet-500",
          color === "amber" && "bg-amber-500"
        )}
      />
      {children}
    </span>
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

function DayCard({
  jour: { date, entries },
  now,
  q,
  token,
  optionsPour,
}: {
  jour: JourPlanning;
  now: Date;
  q: string;
  token: string;
  optionsPour: (role: "menage" | "cuisine") => Option[];
}) {
  const estAujourdhui = isSameDay(date, now);
  const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
  // Ménage toujours avant cuisine dans l'ordre d'affichage.
  const triees = [...filtrees.filter((e) => e.role === "menage"), ...filtrees.filter((e) => e.role === "cuisine")];

  return (
    <div
      className={cn(
        "min-w-0 rounded-[20px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] sm:p-4",
        estAujourdhui
          ? "bg-gradient-to-br from-orange-50 to-amber-50 ring-1 ring-orange-200 dark:from-orange-500/[0.07] dark:to-amber-500/[0.04] dark:ring-orange-400/20"
          : "bg-white ring-1 ring-black/[0.04] dark:bg-white/[0.03] dark:ring-white/[0.06]"
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none text-white",
            estAujourdhui
              ? "bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_2px_8px_rgba(234,88,12,0.35)]"
              : "bg-foreground/80 dark:bg-white/15"
          )}
        >
          <span className="text-[9px] font-semibold uppercase opacity-80">{format(date, "MMM", { locale: fr })}</span>
          <span className="text-base font-bold">{format(date, "d")}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold capitalize">{format(date, "EEEE d MMMM", { locale: fr })}</p>
          {estAujourdhui ? <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Aujourd&apos;hui</p> : null}
        </div>
        {!q ? (
          <span className="ml-auto shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.06]">
            {triees.length}
          </span>
        ) : null}
      </div>

      {q && triees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun résultat.</p>
      ) : triees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Rien de prévu.</p>
      ) : (
        <div className="space-y-2">
          {triees.map((e) => (
            <MissionRow key={e.affectationId} entry={e} token={token} options={optionsPour(e.role)} jour={date} now={now} isToday={estAujourdhui} />
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

function initiale(nom: string): string {
  return nom.trim().charAt(0).toUpperCase() || "?";
}

// Une mission = une ligne en grille stable (avatar · contenu sur 2 lignes · actions groupées à
// droite). L'avatar (initiale + pastille de rôle en médaillon) remplace le badge M/C plat pour
// donner un visage à chaque ligne — voir le commentaire de refonte en tête de fichier.
function MissionRow({
  entry: e,
  token,
  options,
  jour,
  now,
  isToday,
}: {
  entry: PublicPlanningEntry;
  token: string;
  options: Option[];
  jour: Date;
  now: Date;
  isToday: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Kamel, 2026-08-10 : "savoir aussi si par exemple celle prévue demain on valide la veille" —
  // le rappel visuel ne compte que pour demain (pas toute la semaine), c'est le seul moment où
  // "pas encore confirmé" est vraiment urgent.
  const estDemain = isSameDay(jour, addDays(now, 1));
  const aConfirmer = estDemain && !e.confirmeAt;
  const ringClass = isToday ? "ring-2 ring-orange-50 dark:ring-[#241a12]" : "ring-2 ring-white dark:ring-[#1e1e1e]";

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
        "@container/mission grid min-w-0 grid-cols-[2.25rem_1fr_auto] items-start gap-x-2.5 rounded-[14px] p-2",
        aConfirmer ? "bg-amber-500/10" : "bg-black/[0.025] dark:bg-white/[0.04]"
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
            e.role === "menage"
              ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
              : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          )}
        >
          {initiale(e.personnelNom)}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white",
            ringClass,
            e.role === "menage" ? "bg-orange-500" : "bg-violet-500"
          )}
          title={e.role === "menage" ? "Ménage" : "Cuisine"}
        >
          {e.role === "menage" ? "M" : "C"}
        </span>
      </div>

      <div className="min-w-0 space-y-0.5 pt-0.5 @3xl/mission:flex @3xl/mission:items-baseline @3xl/mission:gap-x-2 @3xl/mission:space-y-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          {isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
          <InlineSelect
            value={e.personnelId}
            options={options.map((o) => ({ value: o.id, label: o.nom }))}
            onChange={handlePersonnelChange}
            disabled={isPending}
            className="font-semibold"
          />
          {aConfirmer ? (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              À confirmer
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="min-w-0 truncate @3xl/mission:whitespace-nowrap" title={e.domaineNom ?? undefined}>
            {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName}
          </span>
          {e.role === "cuisine" ? (
            <InlineSelect value={e.avecDejeuner ? "oui" : "non"} options={OPTIONS_REPAS} onChange={handleRepasChange} disabled={isPending} />
          ) : (
            <InlineSelect value={e.moment === "sejour" ? "sejour" : "depart"} options={OPTIONS_MOMENT} onChange={handleMomentChange} disabled={isPending} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {e.telephone ? (
          <a
            href={toWhatsAppUrl(e.telephone)}
            target="_blank"
            rel="noreferrer"
            title={e.telephone}
            aria-label={`WhatsApp ${e.personnelNom}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleToggleConfirme}
          disabled={isPending}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            e.confirmeAt
              ? "bg-emerald-500 text-white hover:bg-emerald-500/90"
              : "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/10"
          )}
          aria-label={e.confirmeAt ? `Annuler la confirmation de ${e.personnelNom}` : `Confirmer ${e.personnelNom}`}
          title={e.confirmeAt ? `Confirmée le ${format(e.confirmeAt, "d MMM HH:mm", { locale: fr })}` : "Pas encore confirmée — cliquer une fois la personne contactée"}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={e.confirmeAt ? 3 : 2} />
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/10"
          aria-label={`Retirer ${e.personnelNom}`}
          title="Retirer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
