import Link from "next/link";
import Image from "next/image";
import { differenceInCalendarDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpRight, ListChecks, LogIn, LogOut, BrushCleaning, ChefHat, Moon, Users, FileCheck2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoisinResa } from "@/lib/taches-du-jour";
import { RowChevron, RowIcon, RowTitle, summaryRowClass } from "@/components/app/dashboard-ui";

export type TacheType = "checkin" | "checkout" | "menage" | "cuisine";
export type TacheStatut = "non_assigne" | "assigne" | "fait" | "a_faire" | "a_valider";

export type TacheJour = {
  key: string;
  type: TacheType;
  at: Date; // heure de la tâche (heure marocaine, comme les dates stockées)
  reservationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  villaPhotoUrl: string | null;
  domaineNom: string | null;
  statut: TacheStatut;
  personnes: string[]; // personnel affecté / validateur
  extra: { label: string; ok: boolean }[]; // fiche police, contrat... (check-in)
  dernierDepart: VoisinResa | null;
  prochaineArrivee: VoisinResa | null;
};

const TYPE_META: Record<TacheType, { label: string; icon: typeof LogIn }> = {
  checkin: { label: "Check-in", icon: LogIn },
  checkout: { label: "Check-out", icon: LogOut },
  menage: { label: "Ménage de départ", icon: BrushCleaning },
  cuisine: { label: "Cuisine", icon: ChefHat },
};

const STATUT_META: Record<TacheStatut, { label: string; className: string }> = {
  non_assigne: { label: "Non assigné", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  assigne: { label: "Assigné", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  a_faire: { label: "À faire", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  a_valider: { label: "Papiers OK · à valider", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  fait: { label: "Fait", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

function quand(d: Date, now: Date): string {
  const heure = format(d, "HH 'h'", { locale: fr });
  const ecart = differenceInCalendarDays(d, now);
  if (ecart === 0) return `Aujourd'hui à ${heure}`;
  if (ecart === 1) return `Demain à ${heure}`;
  if (ecart === -1) return `Hier à ${heure}`;
  return `${format(d, "d MMM", { locale: fr })} à ${heure}`;
}

// Dernier départ / prochaine arrivée de la villa : simple bloc de texte titré (plus d'encadré
// dans l'encadré — 2026-10-21, refonte épurée).
function Voisin({ titre, icone, r, now }: { titre: string; icone: "out" | "in"; r: VoisinResa | null; now: Date }) {
  const Icone = icone === "out" ? LogOut : LogIn;
  return (
    <div className="min-w-0 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        {titre}
      </p>
      {r ? (
        <Link href={`/reservations/${r.id}`} className="block space-y-0.5 hover:text-primary">
          <span className="flex items-center gap-1">
            <span className="truncate font-medium">{r.guestName}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
          <span className="block text-xs">{quand(icone === "out" ? r.checkOut : r.checkIn, now)}</span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Moon className="h-3 w-3" />
              {Math.max(1, differenceInCalendarDays(r.checkOut, r.checkIn))} nuits
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {(r.nbAdultes ?? 0) + (r.nbEnfants ?? 0) || "?"} voyageurs
            </span>
          </span>
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">{icone === "out" ? "Aucun départ récent" : "Aucune arrivée prévue"}</p>
      )}
    </div>
  );
}

// Ligne "Tâches du jour" de l'accueil : repliée par défaut (Kamel, 2026-10-19 : ouverte, elle
// prenait trop de place, surtout sur mobile), le résumé reste visible. Rendue comme une ligne
// d'un bloc (voir page.tsx), pas comme une carte autonome.
export function TachesDuJour({ taches, now }: { taches: TacheJour[]; now: Date }) {
  const aFaire = taches.filter((t) => t.statut !== "fait").length;

  if (taches.length === 0) {
    return (
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <RowIcon icon={ListChecks} tone="ok" />
        <RowTitle sub="Aucune tâche aujourd'hui">Tâches du jour</RowTitle>
      </div>
    );
  }

  return (
    <details className="group">
      <summary className={summaryRowClass}>
        <RowIcon icon={ListChecks} tone={aFaire > 0 ? "attente" : "ok"} />
        <RowTitle
          sub={
            aFaire > 0
              ? `${taches.length} tâche${taches.length > 1 ? "s" : ""} · ${aFaire} à traiter`
              : `${taches.length} tâche${taches.length > 1 ? "s" : ""} · tout est fait`
          }
        >
          Tâches du jour
        </RowTitle>
        <RowChevron />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {taches.map((t) => {
          const meta = TYPE_META[t.type];
          const Icone = meta.icon;
          const statut = STATUT_META[t.statut];
          const logement = [t.villaNom, t.villaNumero ? `n°${t.villaNumero}` : null].filter(Boolean).join(" · ");
          return (
            <li
              key={t.key}
              className="grid gap-x-6 gap-y-3 px-4 py-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center"
            >
              {/* Logement */}
              <div className="flex min-w-0 items-center gap-3">
                {t.villaPhotoUrl ? (
                  <Image
                    src={t.villaPhotoUrl}
                    alt={logement}
                    width={96}
                    height={96}
                    className="h-11 w-11 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-sm font-bold">
                    {t.villaNumero ?? "?"}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{logement || "Logement non renseigné"}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
                    <Icone className="h-3.5 w-3.5 shrink-0" />
                    {meta.label} · {format(t.at, "HH:mm")}
                  </p>
                </div>
              </div>

              {/* Tâche (colonne dédiée sur grand écran, fusionnée avec le logement en dessous) */}
              <div className="hidden min-w-0 lg:block">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {meta.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isSameDay(t.at, now) ? "Aujourd'hui" : format(t.at, "d MMM", { locale: fr })} à {format(t.at, "HH:mm")}
                </p>
              </div>

              {/* Statut / assignation */}
              <div className="min-w-0 space-y-1.5">
                <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", statut.className)}>
                  {statut.label}
                </span>
                {t.personnes.length > 0 ? (
                  <p className="truncate text-xs text-muted-foreground">{t.personnes.join(", ")}</p>
                ) : t.statut === "non_assigne" ? (
                  <p className="text-xs text-muted-foreground">Personne n&apos;est affecté à cette tâche.</p>
                ) : null}
                {t.extra.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {t.extra.map((e) => (
                      <span
                        key={e.label}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          e.ok ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-amber-500/40 text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {e.ok ? <FileCheck2 className="h-3 w-3" /> : <FileWarning className="h-3 w-3" />}
                        {e.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <Voisin titre="Dernier départ" icone="out" r={t.dernierDepart} now={now} />
              <Voisin titre="Prochaine arrivée" icone="in" r={t.prochaineArrivee} now={now} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}
