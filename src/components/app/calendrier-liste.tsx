import Link from "next/link";
import { and, asc, desc, eq, gte, lt, ne } from "drizzle-orm";
import { addDays, differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Building2 } from "lucide-react";
import { getDb } from "@/db";
import { domaines, reservations, villas } from "@/db/schema";
import { PlatformBadge } from "@/components/app/platform-badge";
import { formatUtcTime } from "@/lib/now";
import { cautionEnAttente, estImpayee, estPrepayeeParPlateforme } from "@/lib/reservation-alerts";
import { cn } from "@/lib/utils";

export type FiltreListe = "a-venir" | "en-cours" | "passees" | "impayees" | "cautions";

const FILTRES: { key: FiltreListe; label: string }[] = [
  { key: "a-venir", label: "À venir (30 j)" },
  { key: "en-cours", label: "En cours" },
  { key: "passees", label: "Passées (30 j)" },
  { key: "impayees", label: "Impayées" },
  { key: "cautions", label: "Cautions à encaisser" },
];

const montantFmt = (montant: number, devise: string) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(montant)} ${devise === "EUR" ? "€" : devise}`;

// Vue "Liste" du calendrier, façon page Réservations de SuperHote v2 : tableau des séjours avec
// onglets de filtre. Les filtres "Impayées" et "Cautions" reprennent exactement les règles des
// compteurs de l'accueil (lib/reservation-alerts.ts).
export async function CalendrierListe({ filtre, now }: { filtre: FiltreListe; now: Date }) {
  const db = getDb();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Fenêtre large (60 j avant → 30 j après) puis filtrage en mémoire : couvre tous les onglets
  // avec la même requête, le volume reste de quelques centaines de lignes au plus.
  const rows = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      canal: reservations.canal,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestsCount: reservations.guestsCount,
      villaNom: villas.nom,
      villaPhotoUrl: villas.photoUrl,
      domaineNom: domaines.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      and(
        ne(reservations.status, "annulee"),
        gte(reservations.checkOut, subDays(todayStart, 60)),
        lt(reservations.checkIn, endOfDay(addDays(now, 30)))
      )
    )
    .orderBy(filtre === "passees" ? desc(reservations.checkOut) : asc(reservations.checkIn));

  const counts: Record<FiltreListe, number> = { "a-venir": 0, "en-cours": 0, passees: 0, impayees: 0, cautions: 0 };
  const matches = (r: (typeof rows)[number], f: FiltreListe): boolean => {
    switch (f) {
      case "a-venir":
        return r.checkIn > todayEnd && r.checkIn <= endOfDay(addDays(now, 30));
      case "en-cours":
        return r.checkIn <= todayEnd && r.checkOut >= todayStart;
      case "passees":
        return r.checkOut < todayStart && r.checkOut >= subDays(todayStart, 30);
      case "impayees":
        return estImpayee(r, now);
      case "cautions":
        return cautionEnAttente(r, now);
    }
  };
  for (const r of rows) {
    for (const f of FILTRES) if (matches(r, f.key)) counts[f.key]++;
  }
  const liste = rows.filter((r) => matches(r, filtre));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {FILTRES.map((f) => (
          <Link
            key={f.key}
            href={`/calendrier?vue=liste${f.key !== "a-venir" ? `&filtre=${f.key}` : ""}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              filtre === f.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded px-1.5 text-xs tabular-nums",
                (f.key === "impayees" || f.key === "cautions") && counts[f.key] > 0
                  ? "bg-destructive/10 font-medium text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {counts[f.key]}
            </span>
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {liste.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune réservation dans cet onglet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Voyageur</th>
                  <th className="px-4 py-2.5 font-medium">Hébergement</th>
                  <th className="px-4 py-2.5 font-medium">Arrivée</th>
                  <th className="px-4 py-2.5 font-medium">Départ</th>
                  <th className="px-4 py-2.5 font-medium">Canal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-4 py-2.5 font-medium">Paiement</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {liste.map((r) => {
                  const nuits = differenceInCalendarDays(r.checkOut, r.checkIn);
                  const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
                  const paye = r.montantPaye ? Number(r.montantPaye) : 0;
                  const voyageurs = (r.nbAdultes ?? 0) + (r.nbEnfants ?? 0) || r.guestsCount || null;
                  const initiales = r.guestName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("");
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/reservations/${r.id}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {initiales || "?"}
                          </span>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-sm font-medium">{r.guestName}</p>
                            <p className="text-xs text-muted-foreground">
                              {voyageurs ? `${voyageurs} voyageur${voyageurs > 1 ? "s" : ""} · ` : ""}
                              {nuits} nuit{nuits > 1 ? "s" : ""}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {r.villaPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.villaPhotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md border object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <span className="max-w-[14rem] truncate text-sm">{r.villaNom ?? "—"}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                        {format(r.checkIn, "dd/MM/yyyy", { locale: fr })}
                        <span className="block text-xs text-muted-foreground">{formatUtcTime(r.checkIn)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                        {format(r.checkOut, "dd/MM/yyyy", { locale: fr })}
                        <span className="block text-xs text-muted-foreground">{formatUtcTime(r.checkOut)}</span>
                      </td>
                      <td className="px-4 py-2.5">{r.canal ? <PlatformBadge canal={r.canal} /> : <span className="text-sm text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm tabular-nums">
                        {loyer > 0 ? montantFmt(loyer, r.devisePaiement) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <PaiementChip
                          prepaye={estPrepayeeParPlateforme(r.canal)}
                          loyer={loyer}
                          paye={paye}
                          devise={r.devisePaiement}
                          cautionDue={cautionEnAttente(r, now)}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Link href={`/reservations/${r.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ouvrir la réservation">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PaiementChip({ prepaye, loyer, paye, devise, cautionDue }: { prepaye: boolean; loyer: number; paye: number; devise: string; cautionDue: boolean }) {
  const chips: { label: string; tone: "ok" | "warn" | "muted" }[] = [];
  if (prepaye) chips.push({ label: "Via plateforme", tone: "muted" });
  else if (loyer <= 0) chips.push({ label: "Montant inconnu", tone: "muted" });
  else if (paye >= loyer) chips.push({ label: "Payée", tone: "ok" });
  else chips.push({ label: paye > 0 ? `Reste ${montantFmt(loyer - paye, devise)}` : "Non payée", tone: "warn" });
  if (cautionDue) chips.push({ label: "Caution due", tone: "warn" });
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
            c.tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            c.tone === "warn" && "bg-destructive/10 text-destructive",
            c.tone === "muted" && "bg-muted text-muted-foreground"
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
