import Link from "next/link";
import Image from "next/image";
import { differenceInCalendarDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpRight, LogIn, LogOut, BrushCleaning, ChefHat, Moon, Users, FileCheck2, FileWarning } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VoisinResa } from "@/lib/taches-du-jour";

export type TacheType = "checkin" | "checkout" | "menage" | "cuisine";
export type TacheStatut = "non_assigne" | "assigne" | "fait" | "a_faire";

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
  non_assigne: { label: "Non assigné", className: "bg-destructive/10 text-destructive" },
  assigne: { label: "Assigné", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  a_faire: { label: "À faire", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
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

function CarteSejour({ titre, icone, r, now }: { titre: string; icone: "out" | "in"; r: VoisinResa | null; now: Date }) {
  const Icone = icone === "out" ? LogOut : LogIn;
  return (
    <div className="min-w-0 rounded-lg border border-border p-2.5 text-sm">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        {titre}
      </p>
      {r ? (
        <Link href={`/reservations/${r.id}`} className="block space-y-0.5 hover:text-primary">
          <span className="flex items-center justify-between gap-1">
            <span className="truncate font-medium">{r.guestName}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
          {r.guestPhone ? <span className="block truncate text-xs text-muted-foreground">{r.guestPhone}</span> : null}
          <span className="block text-xs font-medium">{quand(icone === "out" ? r.checkOut : r.checkIn, now)}</span>
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

export function TachesDuJour({ taches, now }: { taches: TacheJour[]; now: Date }) {
  const aFaire = taches.filter((t) => t.statut !== "fait").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
          <span>Tâches du jour</span>
          <span className="text-sm font-normal text-muted-foreground">
            {format(now, "d MMMM", { locale: fr })} · {taches.length} tâche{taches.length > 1 ? "s" : ""}
            {taches.length > 0 ? ` · ${aFaire} à traiter` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {taches.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune tâche aujourd&apos;hui.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {taches.map((t) => {
              const meta = TYPE_META[t.type];
              const Icone = meta.icon;
              const statut = STATUT_META[t.statut];
              const logement = [t.villaNom, t.villaNumero ? `n°${t.villaNumero}` : null].filter(Boolean).join(" · ");
              return (
                <li key={t.key} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
                  {/* Logement */}
                  <div className="flex min-w-0 items-center gap-3">
                    {t.villaPhotoUrl ? (
                      <Image
                        src={t.villaPhotoUrl}
                        alt={logement}
                        width={96}
                        height={96}
                        className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-base font-bold">
                        {t.villaNumero ?? "?"}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{logement || "Logement non renseigné"}</p>
                      {t.domaineNom ? <p className="truncate text-xs text-muted-foreground">{t.domaineNom}</p> : null}
                    </div>
                  </div>

                  {/* Tâche */}
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
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

                  <CarteSejour titre="Dernier départ" icone="out" r={t.dernierDepart} now={now} />
                  <CarteSejour titre="Prochaine arrivée" icone="in" r={t.prochaineArrivee} now={now} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
