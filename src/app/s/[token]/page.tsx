import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Users, MapPin, Wallet, Sparkles, KeyRound } from "lucide-react";
import { getDb } from "@/db";
import { reservations, villas, domaines } from "@/db/schema";
import { reservationRecaps } from "@/db/schema-recaps";
import { Logo } from "@/components/app/logo";
import { Card, CardContent } from "@/components/ui/card";

// Récapitulatif d'une réservation directe, accessible sans connexion par jeton — à transmettre à
// la cliente ou à la personne qui a réservé pour elle. N'affiche jamais la remarque interne ni
// les codes d'accès. Kamel, 2026-10-14 : "un lien dans lequel elle puisse l'envoyer aussi à nous
// ou à la cliente pour qu'elle ait elle aussi tous les détails".
export const dynamic = "force-dynamic";

function montant(n: number, devise: string): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ${devise}`;
}

export default async function RecapPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const db = getDb();
  const [row] = await db
    .select({
      recap: reservationRecaps,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      caution: reservations.caution,
      fraisMenage: reservations.fraisMenage,
      notes: reservations.notes,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaPhotoUrl: villas.photoUrl,
      domaineNom: domaines.nom,
      mapsUrl: domaines.mapsUrl,
    })
    .from(reservationRecaps)
    .innerJoin(reservations, eq(reservationRecaps.reservationId, reservations.id))
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservationRecaps.token, token))
    .limit(1);
  if (!row) notFound();

  const { recap } = row;
  const devise = recap.devise;
  const ci = new Date(row.checkIn);
  const co = new Date(row.checkOut);
  const nuits = Math.max(1, differenceInCalendarDays(co, ci));
  const prixPl = recap.prixPricelabs ? Number(recap.prixPricelabs) : null;
  const total = recap.totalFinal ? Number(recap.totalFinal) : null;
  const avance = recap.avanceVersee ? Number(recap.avanceVersee) : 0;
  const reste = total != null ? Math.max(0, Math.round((total - avance) * 100) / 100) : null;
  const promoLigne =
    prixPl != null && recap.promoType && recap.promoValeur
      ? recap.promoType === "pourcentage"
        ? `Promotion −${Number(recap.promoValeur)} %`
        : `Promotion −${montant(Number(recap.promoValeur), devise)}`
      : null;
  const reduction =
    prixPl != null && recap.promoType && recap.promoValeur
      ? recap.promoType === "pourcentage"
        ? Math.round(prixPl * Number(recap.promoValeur)) / 100
        : Number(recap.promoValeur)
      : 0;
  const mode = recap.modeReglement === "sur_place" ? "à régler sur place" : recap.modeReglement === "virement" ? "à régler par virement" : null;
  const voyageurs = [row.nbAdultes ? `${row.nbAdultes} adulte${row.nbAdultes > 1 ? "s" : ""}` : null, row.nbEnfants ? `${row.nbEnfants} enfant${row.nbEnfants > 1 ? "s" : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pb-10">
      <div className="flex items-center justify-between gap-2 pt-2">
        <Logo />
        <span className="text-xs text-muted-foreground">Récapitulatif de réservation</span>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Réservation au nom de</p>
            <p className="break-words text-xl font-semibold">{row.guestName}</p>
          </div>

          <div className="space-y-1">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {row.villaNom ?? "Logement"}
              {row.villaNumero ? <span className="text-sm font-normal text-muted-foreground">n°{row.villaNumero}</span> : null}
            </p>
            {row.domaineNom ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {row.domaineNom}
                {row.mapsUrl ? (
                  <a href={row.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                    Itinéraire
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Arrivée
              </p>
              <p className="font-medium">{format(ci, "EEEE d MMMM yyyy", { locale: fr })}</p>
              <p className="text-sm text-muted-foreground">à partir de {format(ci, "HH:mm")}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Départ
              </p>
              <p className="font-medium">{format(co, "EEEE d MMMM yyyy", { locale: fr })}</p>
              <p className="text-sm text-muted-foreground">avant {format(co, "HH:mm")}</p>
            </div>
          </div>

          <p className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            {nuits} nuit{nuits > 1 ? "s" : ""}
            {voyageurs ? ` · ${voyageurs}` : ""}
          </p>
          {row.notes ? <p className="rounded-lg bg-muted/50 p-3 text-sm">{row.notes}</p> : null}
        </CardContent>
      </Card>

      {total != null ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-primary" /> Tarif
            </p>
            <dl className="space-y-1.5 text-sm">
              {prixPl != null && promoLigne ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Séjour ({nuits} nuits)</dt>
                  <dd className="shrink-0 text-right">{montant(prixPl, devise)}</dd>
                </div>
              ) : null}
              {promoLigne ? (
                <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-400">
                  <dt>{promoLigne}</dt>
                  <dd className="shrink-0 text-right">
                    −{montant(reduction, devise)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
                <dt>Total du séjour</dt>
                <dd className="shrink-0 text-right">{montant(total, devise)}</dd>
              </div>
              {avance > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Avance déjà versée</dt>
                  <dd className="shrink-0 text-right">−{montant(avance, devise)}</dd>
                </div>
              ) : null}
              {reste != null ? (
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Reste à régler{mode ? ` (${mode})` : ""}</dt>
                  <dd className="shrink-0 text-right">{montant(reste, devise)}</dd>
                </div>
              ) : null}
              {row.caution && Number(row.caution) > 0 ? (
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <dt className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> Caution
                  </dt>
                  <dd className="shrink-0 text-right">{montant(Number(row.caution), devise)}</dd>
                </div>
              ) : null}
              {row.fraisMenage && Number(row.fraisMenage) > 0 ? (
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <dt>Frais de ménage de départ</dt>
                  <dd className="shrink-0 text-right">{montant(Number(row.fraisMenage), devise)}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">Superhosts</p>
    </main>
  );
}
