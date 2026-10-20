"use client";

import { useEffect, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarCheck2, ChevronDown, RefreshCw, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { debloquerNuitsIsoleesMaintenant, rapportNuitsIsolees } from "@/lib/actions/nuits-minimum";
import type { NuitIsolee, RapportNuitsIsolees, StatutNuitIsolee } from "@/lib/beds24/nuits-isolees";

// Bandeau "Nuits isolées" au-dessus de la vue planning : toutes les nuits libres coincées entre
// deux séjours sur les 12 prochains mois, logement par logement, avec leur séjour minimum dans
// Beds24 et dans PriceLabs. Le déblocage est automatique (webhook + cron Beds24) ; le bouton
// "Débloquer maintenant" ne sert qu'à le forcer tout de suite.

const STATUTS: Record<StatutNuitIsolee, { label: string; classe: string }> = {
  reservable: { label: "Réservable", classe: "bg-green-500/15 text-green-700 dark:text-green-400" },
  debloquee: { label: "Débloquée", classe: "bg-green-500/15 text-green-700 dark:text-green-400" },
  a_debloquer: { label: "Bloquée par les nuits min.", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  arrivee_bloquee: { label: "Arrivée/départ bloqué", classe: "bg-muted text-muted-foreground" },
  echec: { label: "Échec Beds24", classe: "bg-destructive/15 text-destructive" },
};

function periode(n: NuitIsolee): string {
  const premier = format(parseISO(n.debut), "EEE d MMM", { locale: fr });
  if (n.nuits === 1) return premier;
  return `${premier} → ${format(parseISO(n.dates[n.dates.length - 1]), "EEE d MMM", { locale: fr })}`;
}

export function NuitsIsoleesPanel({ onRapport, rechargement }: { onRapport: (r: RapportNuitsIsolees) => void; rechargement: number }) {
  const [rapport, setRapport] = useState<RapportNuitsIsolees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let annule = false;
    rapportNuitsIsolees()
      .then((r) => {
        if (annule) return;
        setRapport(r);
        onRapport(r);
      })
      .catch(() => {
        if (!annule) setRapport(null);
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
    // onRapport est stable côté parent (setState) : on ne recharge que sur demande explicite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechargement]);

  function debloquer() {
    startTransition(async () => {
      try {
        const r = await debloquerNuitsIsoleesMaintenant();
        setRapport(r);
        onRapport(r);
        if (r.erreur) toast.error(r.erreur, { duration: 10000 });
        else if (r.debloquees > 0) toast.success(`${r.debloquees} nuit${r.debloquees > 1 ? "s" : ""} isolée${r.debloquees > 1 ? "s" : ""} débloquée${r.debloquees > 1 ? "s" : ""} dans Beds24 (Airbnb + Booking.com).`);
        else toast.success("Rien à débloquer : toutes les nuits isolées sont déjà réservables.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Déblocage impossible pour le moment.");
      }
    });
  }

  const logements = (rapport?.logements ?? []).filter((l) => l.nuitsIsolees.length > 0);
  const total = logements.reduce((s, l) => s + l.nuitsIsolees.length, 0);
  const aDebloquer = logements.reduce((s, l) => s + l.nuitsIsolees.filter((n) => n.statut === "a_debloquer" || n.statut === "echec").length, 0);

  let resume: string;
  if (chargement) resume = "Analyse des nuits isolées dans Beds24…";
  else if (!rapport) resume = "Analyse des nuits isolées indisponible pour le moment.";
  else if (rapport.erreur && total === 0) resume = `Analyse impossible : ${rapport.erreur}`;
  else if (total === 0) resume = "Aucune nuit isolée sur les 12 prochains mois.";
  else
    resume = `${total} nuit${total > 1 ? "s" : ""} isolée${total > 1 ? "s" : ""} sur ${logements.length} logement${logements.length > 1 ? "s" : ""}${
      aDebloquer > 0 ? ` · ${aDebloquer} encore bloquée${aDebloquer > 1 ? "s" : ""} par les nuits min.` : " · toutes réservables"
    }`;

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <CalendarCheck2 className={`h-5 w-5 shrink-0 ${aDebloquer > 0 ? "text-amber-500" : "text-green-600"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Nuits isolées</p>
          <p className="text-xs text-muted-foreground">{resume}</p>
        </div>
        {aDebloquer > 0 ? (
          <Button size="sm" onClick={debloquer} disabled={isPending}>
            <Unlock className="h-4 w-4" />
            {isPending ? "Déblocage…" : "Débloquer maintenant"}
          </Button>
        ) : rapport ? (
          <Button size="sm" variant="ghost" onClick={debloquer} disabled={isPending} title="Relancer l'analyse et le déblocage">
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          </Button>
        ) : null}
        {total > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
            Détail
            <ChevronDown className={`h-4 w-4 transition-transform ${ouvert ? "rotate-180" : ""}`} />
          </Button>
        ) : null}
      </div>
      {ouvert && total > 0 ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Logement</th>
                <th className="px-4 py-2 font-medium">Nuit(s) libre(s)</th>
                <th className="px-4 py-2 font-medium">Nuits min. Beds24</th>
                <th className="px-4 py-2 font-medium">PriceLabs</th>
                <th className="px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {logements.flatMap((l) =>
                l.nuitsIsolees.map((n) => (
                  <tr key={`${l.villaId}:${n.debut}`} className="border-t">
                    <td className="px-4 py-2 font-medium">{l.villaNom}</td>
                    <td className="px-4 py-2 capitalize">{periode(n)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {n.minStayAvant != null && n.minStayAvant !== n.minStay ? (
                        <span>
                          <span className="text-muted-foreground line-through">{n.minStayAvant}</span> → {n.minStay ?? "—"}
                        </span>
                      ) : (
                        (n.minStay ?? "—")
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{n.minStayPricelabs ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUTS[n.statut].classe}`} title={n.detail}>
                        {STATUTS[n.statut].label}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
