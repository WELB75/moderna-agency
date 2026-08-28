"use client";

import { useState, useTransition } from "react";
import { format, isSameDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Select as SelectPrimitive } from "radix-ui";
import { Search, X, Loader2, ChevronDown, MessageCircle, Check } from "lucide-react";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
// cette page (toutes conservées dans la refonte ci-dessous) :
// - "je veux tout sur une ligne chaque jour [...] on a même pas à descendre" : toute la semaine
//   reste visible en une seule colonne verticale, sans navigation jour par jour ni clic pour
//   dérouler — chaque jour est juste une carte qu'on scanne du regard.
// - "deux badges avec couleurs distinctes M (Ménage) et C (Cuisine)" : conservé, seule touche de
//   couleur dans une app par ailleurs strictement monochrome (voir globals.css).
// - "je tape un prénom [...] même les appart" : recherche multi-champs conservée (nom, villa,
//   appart, client), avec le même champ que le panneau Personnel disponible.
// - "en un seul clic qu'on a le WhatsApp" : conservé.
//
// Refonte 2026-08-28 : chaque mission était une pastille compacte où tout (badge, nom modifiable,
// villa/client, détail, confirmation, retrait) devait tenir sur une ligne qui repliait n'importe
// comment sur mobile — trop dense pour scanner vite. Remplacé par une ligne en grille stable
// (badge · contenu · actions) : le nom est toujours la première chose lue, le détail villa/client
// passe en dessous en plus petit, et les actions (WhatsApp, confirmer, retirer) sont groupées à
// droite avec des cibles tactiles réelles au lieu d'icônes de 16px. Le clic sur une date qui ne
// faisait plus rien (l'ancien résumé du jour a été supprimé le 2026-08-10, mais le clic était
// resté, avec un titre "Voir le résumé de ce jour" mensonger) est retiré : seul "aujourd'hui"
// reste mis en valeur, de façon permanente et explicite (badge), pas au clic.
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
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">M</span>
            Femme de ménage
          </span>
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">C</span>
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
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

      <div className="space-y-2.5">
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
        "min-w-0 rounded-lg border p-2.5 sm:p-3",
        estAujourdhui && "border-foreground/50 bg-muted/25"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-medium capitalize">{format(date, "EEEE d MMMM", { locale: fr })}</p>
        {estAujourdhui ? <Badge>Aujourd&apos;hui</Badge> : null}
        {!q ? <span className="ml-auto text-xs text-muted-foreground">{triees.length || ""}</span> : null}
      </div>

      {q && triees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun résultat.</p>
      ) : triees.length === 0 ? (
        <p className="text-xs text-muted-foreground">Rien de prévu.</p>
      ) : (
        <div className="space-y-1.5">
          {triees.map((e) => (
            <MissionRow key={e.affectationId} entry={e} token={token} options={optionsPour(e.role)} jour={date} now={now} />
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

// Une mission = une ligne en grille stable (badge · contenu sur 2 lignes · actions groupées à
// droite), au lieu d'une pastille où tout devait tenir sur une seule ligne qui repliait de façon
// imprévisible sur mobile — voir le commentaire en tête de fichier.
function MissionRow({
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
        "@container/mission grid min-w-0 grid-cols-[1.25rem_1fr_auto] items-start gap-x-2 rounded-md border-l-4 bg-muted/40 py-1.5 pl-2 pr-1.5",
        e.role === "menage" ? "border-l-orange-500" : "border-l-violet-500",
        aConfirmer && "bg-amber-500/10"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
          e.role === "menage" ? "bg-orange-500" : "bg-violet-500"
        )}
        title={e.role === "menage" ? "Ménage" : "Cuisine"}
      >
        {e.role === "menage" ? "M" : "C"}
      </span>

      <div className="min-w-0 space-y-0.5 @3xl/mission:flex @3xl/mission:items-baseline @3xl/mission:gap-x-2 @3xl/mission:space-y-0">
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
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-500/70 dark:text-amber-400">
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

      <div className="flex shrink-0 items-center gap-0.5">
        {e.telephone ? (
          <a
            href={toWhatsAppUrl(e.telephone)}
            target="_blank"
            rel="noreferrer"
            title={e.telephone}
            aria-label={`WhatsApp ${e.personnelNom}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-600 hover:bg-background dark:text-emerald-400"
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
              ? "text-emerald-600 hover:bg-background dark:text-emerald-400"
              : "text-muted-foreground hover:bg-background hover:text-foreground"
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label={`Retirer ${e.personnelNom}`}
          title="Retirer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
