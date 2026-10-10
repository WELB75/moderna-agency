import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays, differenceInCalendarDays, endOfDay, format, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, ChevronLeft, ChevronRight, Moon, RefreshCcw, Users } from "lucide-react";
import { getDb } from "@/db";
import { domaines, gendarmerieForms, personnel, personnelAffectations, reservations, villas } from "@/db/schema";
import { PlatformBadge } from "@/components/app/platform-badge";
import { formatUtcTime } from "@/lib/now";
import { cautionEnAttente } from "@/lib/reservation-alerts";
import { cn } from "@/lib/utils";

const NB_JOURS_BANDEAU = 7;

export type OngletJour = "tout" | "departs" | "arrivees" | "sur-place";

type Resa = {
  id: string;
  villaId: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaPhotoUrl: string | null;
  domaineNom: string | null;
  guestName: string;
  guestPhone: string | null;
  checkIn: Date;
  checkOut: Date;
  canal: string | null;
  guestsCount: number | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  caution: string | null;
  cautionPayee: boolean;
  loyerTotal: string | null;
  montantPaye: string | null;
  checkinValideAt: Date | null;
  checkoutValideAt: Date | null;
};

function jourKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function nbVoyageurs(r: Resa): number | null {
  const parts = (r.nbAdultes ?? 0) + (r.nbEnfants ?? 0);
  return parts > 0 ? parts : r.guestsCount;
}

// Vue "Jour" du calendrier, sur le modèle de SuperHote v2 : bandeau des 7 jours (départs,
// arrivées et ménages à assigner pour chacun), onglets Tout / Départs / Arrivées / Sur place,
// puis un tableau par type avec ce qu'il faut savoir pour organiser la journée — prochaine
// arrivée dans la même villa (rotation le jour même), ménage de départ affecté ou non, fiche
// police et caution des arrivées.
export async function CalendrierJour({ date, onglet, now }: { date: Date; onglet: OngletJour; now: Date }) {
  const db = getDb();
  const jour = startOfDay(date);
  const debutBandeau = jour;
  const finBandeau = endOfDay(addDays(jour, NB_JOURS_BANDEAU - 1));

  // Toutes les réservations qui touchent le bandeau, plus celles qui arrivent dans les 60 jours
  // suivants (pour retrouver la "prochaine arrivée" de chaque villa après un départ).
  const resas: Resa[] = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaPhotoUrl: villas.photoUrl,
      domaineNom: domaines.nom,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      canal: reservations.canal,
      guestsCount: reservations.guestsCount,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      checkinValideAt: reservations.checkinValideAt,
      checkoutValideAt: reservations.checkoutValideAt,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      and(
        ne(reservations.status, "annulee"),
        gte(reservations.checkOut, debutBandeau),
        lte(reservations.checkIn, endOfDay(addDays(finBandeau, 60)))
      )
    )
    .orderBy(asc(reservations.checkIn));

  const departsBandeau = resas.filter((r) => r.checkOut >= debutBandeau && r.checkOut <= finBandeau);
  const idsDeparts = departsBandeau.map((r) => r.id);
  const affectationsMenage =
    idsDeparts.length > 0
      ? await db
          .select({ reservationId: personnelAffectations.reservationId, nom: personnel.nom, moment: personnelAffectations.moment })
          .from(personnelAffectations)
          .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
          .where(and(inArray(personnelAffectations.reservationId, idsDeparts), eq(personnel.role, "menage")))
      : [];
  // Ménage de départ = toute affectation ménage qui n'est pas un ménage "pendant le séjour".
  const menageParResa = new Map<string, string[]>();
  for (const a of affectationsMenage) {
    if (a.moment === "sejour") continue;
    const list = menageParResa.get(a.reservationId) ?? [];
    list.push(a.nom);
    menageParResa.set(a.reservationId, list);
  }

  const jours = Array.from({ length: NB_JOURS_BANDEAU }, (_, i) => addDays(jour, i));
  const resumeJours = jours.map((d) => {
    const departs = resas.filter((r) => isSameDay(r.checkOut, d));
    const arrivees = resas.filter((r) => isSameDay(r.checkIn, d));
    const aAssigner = departs.filter((r) => !menageParResa.has(r.id)).length;
    return { d, departs: departs.length, arrivees: arrivees.length, aAssigner };
  });

  const departs = resas.filter((r) => isSameDay(r.checkOut, jour)).sort((a, b) => a.checkOut.getTime() - b.checkOut.getTime());
  const arrivees = resas.filter((r) => isSameDay(r.checkIn, jour)).sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
  const surPlace = resas.filter((r) => r.checkIn < jour && r.checkOut > endOfDay(jour));

  const idsArrivees = arrivees.map((r) => r.id);
  const fiches =
    idsArrivees.length > 0
      ? await db
          .select({ reservationId: gendarmerieForms.reservationId, statut: gendarmerieForms.statut })
          .from(gendarmerieForms)
          .where(inArray(gendarmerieForms.reservationId, idsArrivees))
      : [];
  const ficheComplete = new Set(fiches.filter((f) => f.statut === "complete").map((f) => f.reservationId));

  function prochaineArrivee(r: Resa): Resa | null {
    if (!r.villaId) return null;
    const debut = startOfDay(r.checkOut);
    return resas.find((x) => x.id !== r.id && x.villaId === r.villaId && x.checkIn >= debut) ?? null;
  }

  const lienJour = (d: Date, o: OngletJour = onglet) =>
    `/calendrier?vue=jour&date=${jourKey(d)}${o !== "tout" ? `&onglet=${o}` : ""}`;

  const onglets: { key: OngletJour; label: string; count: number }[] = [
    { key: "tout", label: "Tout", count: departs.length + arrivees.length },
    { key: "departs", label: "Départs", count: departs.length },
    { key: "arrivees", label: "Arrivées", count: arrivees.length },
    { key: "sur-place", label: "Sur place", count: surPlace.length },
  ];

  const departsAAssigner = departs.filter((r) => !menageParResa.has(r.id)).length;

  return (
    <div className="space-y-4">
      {/* Navigation jour par jour + bandeau des 7 jours */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={lienJour(addDays(jour, -1))} className="rounded-md border bg-card p-1.5 text-muted-foreground hover:text-foreground" aria-label="Jour précédent">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link
          href={lienJour(now)}
          className={cn(
            "rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted",
            isSameDay(jour, now) && "border-primary/40 text-primary"
          )}
        >
          Aujourd&apos;hui
        </Link>
        <Link href={lienJour(addDays(jour, 1))} className="rounded-md border bg-card p-1.5 text-muted-foreground hover:text-foreground" aria-label="Jour suivant">
          <ChevronRight className="h-4 w-4" />
        </Link>
        <span className="ml-1 text-sm font-medium first-letter:uppercase">{format(jour, "EEEE d MMMM yyyy", { locale: fr })}</span>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {resumeJours.map(({ d, departs: nbD, arrivees: nbA, aAssigner }) => {
          const actif = isSameDay(d, jour);
          return (
            <Link
              key={jourKey(d)}
              href={lienJour(d)}
              className={cn(
                "min-w-[9.5rem] flex-1 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-primary/40",
                actif && "border-primary bg-primary/5 ring-1 ring-primary/30"
              )}
            >
              <p className={cn("text-sm font-semibold first-letter:uppercase", actif && "text-primary")}>
                {format(d, "EEE d MMM", { locale: fr })}
              </p>
              <p className="text-xs text-muted-foreground">
                {nbD} départ{nbD > 1 ? "s" : ""} · {nbA} arrivée{nbA > 1 ? "s" : ""}
              </p>
              {aAssigner > 0 ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {aAssigner} ménage{aAssigner > 1 ? "s" : ""} à assigner
                </p>
              ) : nbD > 0 ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Ménages assignés
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground/70">—</p>
              )}
            </Link>
          );
        })}
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {onglets.map((o) => (
          <Link
            key={o.key}
            href={lienJour(jour, o.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              onglet === o.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {o.label}
            <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{o.count}</span>
          </Link>
        ))}
      </div>

      {onglet === "tout" || onglet === "departs" ? (
        <Section
          titre="Départs"
          tone="amber"
          compteur={`${departs.length}`}
          sousTitre={departsAAssigner > 0 ? `${departsAAssigner} ménage${departsAAssigner > 1 ? "s" : ""} à assigner` : undefined}
          vide="Aucun départ ce jour-là."
          colonnes={["Hébergement · voyageur", "Départ", "Prochaine arrivée", "Ménage"]}
          lignes={departs.map((r) => {
            const suivante = prochaineArrivee(r);
            const rotation = suivante ? isSameDay(suivante.checkIn, r.checkOut) : false;
            const menage = menageParResa.get(r.id) ?? [];
            return {
              id: r.id,
              cellules: [
                <HebergementCell key="h" r={r} badge={rotation ? "Rotation" : undefined} />,
                <span key="t" className="inline-flex items-center gap-1.5 tabular-nums">
                  {formatUtcTime(r.checkOut)}
                  {r.checkoutValideAt ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Départ validé" /> : null}
                </span>,
                suivante ? (
                  <div key="n" className="leading-tight">
                    <p className={cn("text-sm font-medium", rotation && "text-emerald-700 dark:text-emerald-400")}>
                      {rotation ? `Aujourd'hui ${formatUtcTime(suivante.checkIn)}` : format(suivante.checkIn, "EEE d MMM", { locale: fr })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suivante.guestName} · {differenceInCalendarDays(suivante.checkOut, suivante.checkIn)} nuits
                    </p>
                  </div>
                ) : (
                  <span key="n" className="text-sm text-muted-foreground">Aucune prévue</span>
                ),
                menage.length > 0 ? (
                  <span key="m" className="inline-flex items-center gap-1.5 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {menage.join(", ")}
                  </span>
                ) : (
                  <span key="m" className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    Non assigné
                  </span>
                ),
              ],
            };
          })}
        />
      ) : null}

      {onglet === "tout" || onglet === "arrivees" ? (
        <Section
          titre="Arrivées"
          tone="emerald"
          compteur={`${arrivees.length}`}
          vide="Aucune arrivée ce jour-là."
          colonnes={["Hébergement · voyageur", "Arrivée", "Séjour", "Fiche police", "Caution"]}
          lignes={arrivees.map((r) => {
            const nuits = differenceInCalendarDays(r.checkOut, r.checkIn);
            const voyageurs = nbVoyageurs(r);
            const montantCaution = r.caution ? Number(r.caution) : 0;
            return {
              id: r.id,
              cellules: [
                <HebergementCell key="h" r={r} />,
                <span key="t" className="inline-flex items-center gap-1.5 tabular-nums">
                  {formatUtcTime(r.checkIn)}
                  {r.checkinValideAt ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Arrivée validée" /> : null}
                </span>,
                <span key="s" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Moon className="h-3.5 w-3.5" />
                    {nuits} nuit{nuits > 1 ? "s" : ""}
                  </span>
                  {voyageurs ? (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {voyageurs}
                    </span>
                  ) : null}
                  {r.canal ? <PlatformBadge canal={r.canal} /> : null}
                </span>,
                ficheComplete.has(r.id) ? (
                  <StatusDot key="f" ok label="Complète" />
                ) : (
                  <StatusDot key="f" ok={false} label="À compléter" />
                ),
                montantCaution <= 0 ? (
                  <span key="c" className="text-sm text-muted-foreground">—</span>
                ) : r.cautionPayee ? (
                  <StatusDot key="c" ok label="Reçue" />
                ) : (
                  <StatusDot key="c" ok={false} label={cautionEnAttente(r, now) ? "À encaisser" : "En attente"} />
                ),
              ],
            };
          })}
        />
      ) : null}

      {onglet === "sur-place" ? (
        <Section
          titre="Voyageurs sur place"
          tone="primary"
          compteur={`${surPlace.length}`}
          vide="Personne sur place ce jour-là (hors arrivées et départs)."
          colonnes={["Hébergement · voyageur", "Arrivé le", "Départ prévu"]}
          lignes={surPlace.map((r) => ({
            id: r.id,
            cellules: [
              <HebergementCell key="h" r={r} />,
              <span key="a" className="text-sm">{format(r.checkIn, "EEE d MMM", { locale: fr })}</span>,
              <span key="d" className="text-sm">
                {format(r.checkOut, "EEE d MMM", { locale: fr })} · {formatUtcTime(r.checkOut)}
              </span>,
            ],
          }))}
        />
      ) : null}
    </div>
  );
}

const SECTION_TONES = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  primary: "bg-primary",
} as const;

function Section({
  titre,
  tone,
  compteur,
  sousTitre,
  vide,
  colonnes,
  lignes,
}: {
  titre: string;
  tone: keyof typeof SECTION_TONES;
  compteur: string;
  sousTitre?: string;
  vide: string;
  colonnes: string[];
  lignes: { id: string; cellules: React.ReactNode[] }[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className={cn("h-2 w-2 rounded-full", SECTION_TONES[tone])} />
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em]">{titre}</h3>
        <span className="rounded bg-background px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{compteur}</span>
        {sousTitre ? <span className="text-xs font-medium text-destructive">{sousTitre}</span> : null}
      </div>
      {lignes.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vide}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                {colonnes.map((c) => (
                  <th key={c} className="px-4 py-2 font-medium">
                    {c}
                  </th>
                ))}
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="group border-b last:border-b-0 hover:bg-muted/40">
                  {l.cellules.map((c, i) => (
                    <td key={i} className="px-4 py-2.5 align-middle">
                      {c}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right">
                    <Link href={`/reservations/${l.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ouvrir la réservation">
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HebergementCell({ r, badge }: { r: Resa; badge?: string }) {
  return (
    <Link href={`/reservations/${r.id}`} className="flex min-w-0 items-center gap-3">
      {r.villaPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.villaPhotoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <Building2 className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span className="truncate">{r.villaNom ?? "Logement non rattaché"}</span>
          {badge ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
              <RefreshCcw className="h-2.5 w-2.5" />
              {badge}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {r.guestName}
          {r.domaineNom ? ` · ${r.domaineNom}` : ""}
        </p>
      </div>
    </Link>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", ok ? "text-emerald-700 dark:text-emerald-400" : "font-medium text-destructive")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-destructive")} />
      {label}
    </span>
  );
}
