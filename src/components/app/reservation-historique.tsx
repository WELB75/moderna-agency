import { History } from "lucide-react";
import type { EntreeJournal } from "@/lib/journal";
import { formatHeureMaroc, LIBELLES_ACTION } from "@/lib/journal-format";
import { RefermerDatesButton } from "@/components/app/refermer-dates-button";
import { cn } from "@/lib/utils";

// Historique "qui a fait quoi, quand" d'une réservation (journal, voir src/lib/journal.ts),
// affiché sous la fiche. Les réservations ajoutées avant la mise en place du journal
// (16/10/2026) n'ont que leur date d'ajout, sans auteur.
export function ReservationHistorique({
  reservationId,
  ajouteeLe,
  entrees,
  peutRefermer,
}: {
  reservationId: string;
  ajouteeLe: string | null;
  entrees: EntreeJournal[];
  peutRefermer: boolean;
}) {
  const aCreation = entrees.some((e) => e.action === "creation");
  // Dernier état connu de la fermeture Beds24 (création ou nouvelle fermeture manuelle).
  const derniereFermeture = [...entrees].reverse().find((e) => e.action === "creation" || e.action === "fermeture_beds24");
  const enEchec = derniereFermeture?.beds24Statut === "echec";

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" />
        Historique
      </h2>

      {enEchec ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          Les dates ne sont peut-être PAS fermées sur Airbnb et Booking.com : {derniereFermeture?.beds24Detail}
        </p>
      ) : null}

      <ul className="space-y-2 text-sm">
        {!aCreation && ajouteeLe ? (
          <li className="flex flex-col gap-0.5">
            <span className="font-medium">Ajout · {formatHeureMaroc(ajouteeLe)}</span>
            <span className="text-xs text-muted-foreground">
              Auteur non enregistré (réservation ajoutée avant la mise en place du journal, le 16/10/2026).
            </span>
          </li>
        ) : null}
        {entrees.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5">
            <span className="font-medium">
              {LIBELLES_ACTION[e.action] ?? e.action} · {formatHeureMaroc(e.createdAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              par {e.auteurNom ?? "inconnu"}
              {e.auteurEmail && e.auteurEmail !== e.auteurNom ? ` (${e.auteurEmail})` : ""}
              {e.resume ? ` — ${e.resume}` : ""}
            </span>
            {e.beds24Detail ? (
              <span
                className={cn(
                  "text-xs",
                  e.beds24Statut === "echec"
                    ? "font-medium text-destructive"
                    : e.beds24Statut === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                )}
              >
                Beds24 : {e.beds24Detail}
              </span>
            ) : null}
          </li>
        ))}
        {entrees.length === 0 && !ajouteeLe ? <li className="text-muted-foreground">Aucune action enregistrée.</li> : null}
      </ul>

      {peutRefermer ? <RefermerDatesButton reservationId={reservationId} urgent={enEchec} /> : null}
    </div>
  );
}
