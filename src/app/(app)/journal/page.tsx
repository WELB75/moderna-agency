import Link from "next/link";
import { auteursDuJournal, journalRecent, peutSupprimerJournal, type EntreeJournal } from "@/lib/journal";
import { JournalSupprimerButton } from "@/components/app/journal-supprimer-button";
import { formatHeureMaroc, LIBELLES_ACTION, LIBELLES_CATEGORIE } from "@/lib/journal-format";
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

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ qui?: string; cat?: string }> }) {
  const { qui, cat } = await searchParams;
  const [entrees, auteurs, peutSupprimer] = await Promise.all([
    journalRecent(300, { qui, categorie: cat }),
    auteursDuJournal(),
    peutSupprimerJournal(),
  ]);
  const echecs = entrees.filter((e) => e.beds24Statut === "echec").length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        <p className="text-sm text-muted-foreground">
          Qui s&apos;est connecté et qui a fait quoi dans l&apos;application (réservations, paiements, caisse, logements,
          équipe...), à quelle heure (heure du Maroc) et depuis quel appareil. Pour les réservations et blocages : si les
          dates ont bien été fermées ou rouvertes sur Beds24 (Airbnb + Booking.com). Réservations enregistrées depuis le
          16/10/2026, connexions et autres actions depuis le 18/10/2026.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Qui
            <select name="qui" defaultValue={qui ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">Tout le monde</option>
              {auteurs.map((a) => (
                <option key={a.email ?? a.nom} value={a.email ?? a.nom}>
                  {a.nom}
                  {a.email && a.email !== a.nom ? ` (${a.email})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Type
            <select name="cat" defaultValue={cat ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">Tout</option>
              {Object.entries(LIBELLES_CATEGORIE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Filtrer
          </button>
          {qui || cat ? (
            <Link href="/journal" className="h-9 content-center px-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
              Réinitialiser
            </Link>
          ) : null}
        </form>
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
                        {e.libelle ?? LIBELLES_ACTION[e.action] ?? e.action}
                        {e.villaNom ? ` · ${e.villaNom}` : ""}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {formatHeureMaroc(e.createdAt).split(" à ")[1]}
                        {peutSupprimer ? (
                          <JournalSupprimerButton
                            id={e.id}
                            avertissement={
                              e.action === "creation" || e.action === "fermeture_beds24"
                                ? "Cette ligne sert à savoir si les dates ont été fermées sur Beds24 : la supprimer peut empêcher leur réouverture automatique si la réservation est supprimée plus tard. Clique à nouveau pour confirmer."
                                : undefined
                            }
                          />
                        ) : null}
                      </span>
                    </div>
                    <span className={cn("text-xs", e.auteurType === "systeme" ? "text-muted-foreground" : "font-medium")}>
                      par {e.auteurNom ?? "inconnu"}
                      {e.auteurEmail && e.auteurEmail !== e.auteurNom ? ` (${e.auteurEmail})` : ""}
                    </span>
                    {e.appareil || e.ip ? (
                      <span className="text-xs text-muted-foreground">
                        {[e.appareil, e.ip].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
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
