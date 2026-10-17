"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { BrushCleaning, ChefHat, ChevronRight, Search, User, X } from "lucide-react";
import { PlanningRemoveButton } from "@/components/app/planning-remove-button";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";

export type PlanningEntry = {
  affectationId: string;
  reservationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  guestName: string;
  role: "menage" | "cuisine";
  moment: "sejour" | "depart" | "unique";
  personnelNom: string;
  avecDejeuner: boolean;
  montantVisible: boolean;
};

type JourPlanning = { date: Date; entries: PlanningEntry[] };

// Une mission = une réservation × un type de travail (ménage de départ, ménage pendant le séjour,
// cuisine). Plusieurs personnes peuvent y être affectées : elles sont regroupées dans la même
// carte au lieu d'une carte par personne (ex. Nouhaila + Aisha sur le ménage de départ de Villa
// Tania = une seule carte avec deux prénoms).
type Mission = {
  key: string;
  reservationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  guestName: string;
  role: "menage" | "cuisine";
  moment: PlanningEntry["moment"];
  personnes: PlanningEntry[];
};

// Historique des demandes qui ont façonné cette grille (toujours respectées) :
// - 2026-08-07 : recherche par prénom directement dans le planning, sans rechargement.
// - 2026-08-28 : recherche étendue à la villa/l'appart et au client (matchesSearch).
// - 2026-08-30 : villa et numéro jamais tronqués ; "Cuisine" comme libellé principal, la formule
//   de repas en étiquette secondaire.
// - 2026-09-08 : charte plate façon Stripe (cartes à bordure fine, poids normal/medium).
//
// Refonte 2026-10-17 (lisibilité) — "c pas clair on comprend pas tout". Les 7 jours en cases sur
// 2 colonnes se lisaient en zig-zag (lundi | mardi, mercredi | jeudi...), les jours vides
// prenaient autant de place que les jours chargés, chaque personne avait sa propre carte même
// à plusieurs sur la même villa, la villa était coupée ("Villa ...") et le nom du client n'était
// pas identifié. Désormais : agenda vertical (une ligne par jour, lundi → dimanche), missions
// regroupées par villa + type de travail, client écrit "Client : ...", jours vides réduits à une
// ligne, croix de retrait discrète (au survol sur ordinateur) pour éviter les retraits par erreur.
export function PersonnelPlanningGrid({ jours, now }: { jours: JourPlanning[]; now: Date }) {
  const [recherche, setRecherche] = useState("");
  const q = recherche.trim();
  const aujourdhui = startOfDay(now);

  const joursFiltres = jours.map(({ date, entries }) => {
    const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
    return { date, entries: filtrees, missions: regrouperMissions(filtrees) };
  });
  const toutes = joursFiltres.flatMap((j) => j.entries);
  const nbMenage = toutes.filter((e) => e.role === "menage").length;
  const nbCuisine = toutes.filter((e) => e.role === "cuisine").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Légende + compteurs de la semaine (suivent la recherche : taper un prénom donne son
            nombre de missions de la semaine). */}
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="orange" count={nbMenage} unit="ménage" unitPlural="ménages" />
          <LegendChip color="violet" count={nbCuisine} unit="jour de cuisine" unitPlural="jours de cuisine" />
        </div>

        <div className="relative w-full md:max-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher (prénom, villa, client...)"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-7 text-base outline-none max-md:min-h-11 md:text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50"
          />
          {recherche ? (
            <button
              type="button"
              onClick={() => setRecherche("")}
              aria-label="Effacer"
              className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground max-md:h-11 max-md:w-11 md:right-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_8px_rgba(50,50,93,0.06)]">
        {joursFiltres.map(({ date, missions }, i) => {
          const estAujourdhui = isSameDay(date, now);
          const estPasse = startOfDay(date) < aujourdhui;
          const vide = missions.length === 0;
          return (
            <section
              key={date.toISOString()}
              aria-label={format(date, "EEEE d MMMM", { locale: fr })}
              className={cn(
                "relative grid grid-cols-[3.75rem_1fr] gap-3 px-3 md:grid-cols-[5rem_1fr] md:gap-4 md:px-4",
                i > 0 && "border-t border-border",
                vide ? "py-2.5" : "py-3.5",
                estAujourdhui && "bg-primary/[0.04]"
              )}
            >
              {estAujourdhui ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null}

              {/* Colonne date : jour de la semaine + numéro, "Aujourd'hui" bien visible. */}
              <div className={cn("flex flex-col items-center text-center", vide ? "justify-center" : "pt-0.5")}>
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    estAujourdhui ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {format(date, "EEE", { locale: fr }).replace(".", "")}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex items-center justify-center rounded-full font-semibold leading-none",
                    vide ? "h-7 w-7 text-base" : "h-9 w-9 text-lg",
                    estAujourdhui ? "bg-primary text-primary-foreground" : estPasse ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {format(date, "d")}
                </span>
                {estAujourdhui ? (
                  <span className="mt-1 text-[10px] font-medium leading-none text-primary">Aujourd&apos;hui</span>
                ) : null}
              </div>

              <div className="@container min-w-0 self-center">
                {vide ? (
                  <p className="text-sm text-muted-foreground">{q ? "Aucun résultat ce jour-là." : "Rien de prévu"}</p>
                ) : (
                  <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">
                    {missions.map((m) => (
                      <MissionCard key={m.key} mission={m} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LegendChip({
  color,
  count,
  unit,
  unitPlural,
}: {
  color: "orange" | "violet";
  count: number;
  unit: string;
  unitPlural: string;
}) {
  const Icon = color === "orange" ? BrushCleaning : ChefHat;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        color === "orange" ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {count} {count > 1 ? unitPlural : unit}
    </span>
  );
}

function entreeCorrespond(e: PlanningEntry, q: string): boolean {
  const haystack = [e.personnelNom, e.villaNom ?? "", e.villaNumero ?? "", e.guestName, detailLabel(e.role, e.moment)].join(" ");
  return matchesSearch(haystack, q);
}

// Garde l'ordre d'arrivée (ménage d'abord, puis cuisine, puis par villa — tri fait côté serveur).
function regrouperMissions(entries: PlanningEntry[]): Mission[] {
  const parCle = new Map<string, Mission>();
  for (const e of entries) {
    // Clé sur le libellé affiché (et non le moment brut) : "depart" et "unique" s'affichent tous
    // deux "Ménage de départ", ils doivent tomber dans la même carte.
    const key = `${e.reservationId}|${detailLabel(e.role, e.moment)}`;
    const existante = parCle.get(key);
    if (existante) {
      existante.personnes.push(e);
    } else {
      parCle.set(key, {
        key,
        reservationId: e.reservationId,
        villaNom: e.villaNom,
        villaNumero: e.villaNumero,
        guestName: e.guestName,
        role: e.role,
        moment: e.moment,
        personnes: [e],
      });
    }
  }
  return [...parCle.values()];
}

function detailLabel(role: PlanningEntry["role"], moment: PlanningEntry["moment"]): string {
  if (role === "cuisine") return "Cuisine";
  return moment === "sejour" ? "Ménage pendant le séjour" : "Ménage de départ";
}

function formuleRepasLabel(e: PlanningEntry): string {
  return e.avecDejeuner ? "Petit-déj + déj" : "Petit-déj seul";
}

// Le numéro "?" (logement sans numéro attribué) n'apporte rien à l'écran : on ne l'affiche pas.
function numeroAffichable(numero: string | null): string | null {
  const n = numero?.trim();
  return n && n !== "?" ? n : null;
}

function initiale(nom: string): string {
  return nom.trim().charAt(0).toUpperCase() || "?";
}

function MissionCard({ mission: m }: { mission: Mission }) {
  const orange = m.role === "menage";
  const numero = numeroAffichable(m.villaNumero);

  // Formule repas / "payé par le proprio" : affichées une seule fois sur la carte quand elles
  // valent pour tout le monde, sinon à côté du prénom concerné.
  const formules = new Set(m.personnes.map((p) => (p.role === "cuisine" ? formuleRepasLabel(p) : null)).filter(Boolean));
  const formuleCommune = formules.size === 1 ? [...formules][0] : null;
  const nbProprio = m.personnes.filter((p) => !p.montantVisible).length;
  const proprioPourTous = nbProprio > 0 && nbProprio === m.personnes.length;

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border border-border border-l-[3px] bg-background/60 p-3 dark:bg-muted/40",
        orange ? "border-l-orange-500" : "border-l-violet-500"
      )}
    >
      {/* Ligne 1 : où (villa + numéro, jamais tronqués) et quoi (type de mission). */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <Link
          href={`/reservations/${m.reservationId}`}
          className="group/villa inline-flex min-w-0 items-center gap-1.5 text-[15px] font-medium leading-snug text-foreground hover:underline underline-offset-4"
        >
          <span className="break-words">{m.villaNom ?? "Logement non renseigné"}</span>
          {numero ? (
            <span className="shrink-0 rounded-md border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              n°{numero}
            </span>
          ) : null}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/villa:translate-x-0.5" />
        </Link>

        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              orange ? "bg-orange-500/15 text-orange-700 dark:text-orange-300" : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            )}
          >
            {orange ? <BrushCleaning className="h-3 w-3" /> : <ChefHat className="h-3 w-3" />}
            {detailLabel(m.role, m.moment)}
          </span>
          {formuleCommune ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{formuleCommune}</span>
          ) : null}
          {proprioPourTous ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Payé par le proprio</span>
          ) : null}
        </div>
      </div>

      {/* Ligne 2 : qui intervient — prénoms bien visibles. */}
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {m.personnes.map((p) => {
          const precisions = [
            !formuleCommune && p.role === "cuisine" ? formuleRepasLabel(p) : null,
            !proprioPourTous && !p.montantVisible ? "payé par le proprio" : null,
          ].filter(Boolean);
          return (
            <li
              key={p.affectationId}
              className="group/pers inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  orange
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                    : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                )}
              >
                {initiale(p.personnelNom)}
              </span>
              <span className="min-w-0 break-words text-sm font-medium leading-tight">
                {p.personnelNom}
                {precisions.length > 0 ? (
                  <span className="font-normal text-muted-foreground"> · {precisions.join(" · ")}</span>
                ) : null}
              </span>
              <PlanningRemoveButton
                affectationId={p.affectationId}
                nom={p.personnelNom}
                className="h-6 w-6 max-md:h-8 max-md:w-8 pointer-fine:opacity-0 pointer-fine:group-hover/pers:opacity-100 pointer-fine:group-focus-within/pers:opacity-100"
              />
            </li>
          );
        })}
      </ul>

      {/* Ligne 3 : pour quel client — clairement étiqueté. */}
      <p className="mt-2.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate" title={m.guestName}>
          Client : <span className="text-foreground/80">{m.guestName}</span>
        </span>
      </p>
    </article>
  );
}
