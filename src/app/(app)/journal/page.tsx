import Link from "next/link";
import { journalRecent, type EntreeJournal } from "@/lib/journal";
import { formatHeureMaroc, LIBELLES_ACTION } from "@/lib/journal-format";
import { cn } from "@/lib/utils";

// Journal : toutes les actions sur les réservations et blocages, plus récentes d'abord — qui a
// ajouté, supprimé (dates rouvertes), changé une heure, ou si c'est la synchro Beds24 qui a
// importé/annulé une réservation. Fouad, 2026-10-16 : "sécurise ça qu'on ait plus ce souci à
// l'avenir" (blocage Amal Cosy créé sans savoir par qui). Seule trace des réservations
// supprimées, puisqu'elles disparaissent de l'app.
const jourMaroc = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Casablanca",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function parJour(entrees: EntreeJournal[]): { jour: string; entrees: EntreeJournal[] }[] {
  const groupes: { jour: string; entrees: EntreeJournal[] }[] = [];
  for (const e of entrees) {
    const jour = jourMaroc.format(new Date(e.createdAt));
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.entrees.push(e);
    else groupes.push({ jour, entrees: [e] });
  }
  return groupes;
}

export default async function JournalPage() {
  const entrees = await journalRecent(300);
  const echecs = entrees.filter((e) => e.beds24Statut === "echec").length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        <p className="text-sm text-muted-foreground">
          Qui a ajouté, supprimé ou modifié une réservation ou un blocage, à quelle heure (heure du Maroc), et si les dates
          ont bien été fermées ou rouvertes sur Beds24 (Airbnb + Booking.com). Enregistré depuis le 16/10/2026.
        </p>
        {echecs > 0 ? (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {echecs} action{echecs > 1 ? "s" : ""} avec un échec Beds24 ci-dessous : vérifier que les dates sont bien fermées.
          </p>
        ) : null}
      </div>

      {entrees.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune action enregistrée pour l&apos;instant.</p>
      ) : (
        parJour(entrees).map((g) => (
          <section key={g.jour} className="space-y-2">
            <h2 className="text-sm font-semibold capitalize text-muted-foreground">{g.jour}</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {g.entrees.map((e) => {
                const lien = e.reservationId && e.action !== "suppression" && e.action !== "annulation" ? `/reservations/${e.reservationId}` : null;
                return (
                  <li key={e.id} className="flex flex-col gap-1 p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-medium">
                        {LIBELLES_ACTION[e.action] ?? e.action}
                        {e.villaNom ? ` · ${e.villaNom}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatHeureMaroc(e.createdAt).split(" à ")[1]}</span>
                    </div>
                    <span className={cn("text-xs", e.auteurType === "systeme" ? "text-muted-foreground" : "font-medium")}>
                      par {e.auteurNom ?? "inconnu"}
                      {e.auteurEmail && e.auteurEmail !== e.auteurNom ? ` (${e.auteurEmail})` : ""}
                    </span>
                    {e.resume ? (
                      lien ? (
                        <Link href={lien} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                          {e.resume}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">{e.resume}</span>
                      )
                    ) : null}
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
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
