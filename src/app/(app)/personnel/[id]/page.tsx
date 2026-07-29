import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, ne, gte, lte, inArray } from "drizzle-orm";
import { format, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneLink } from "@/components/app/phone-link";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";
import { montantMenageDu, montantCuisineDu } from "@/lib/personnel-tarifs";

// Fiche individuelle : pour une personne donnée, ce qu'elle a fait et gagné ce mois-ci — demandé
// pour que la recherche globale ("Touria") amène directement à cette vue plutôt qu'à la liste
// générale de Personnel.
export default async function PersonnelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const now = nowInMorocco();

  const [p] = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
  if (!p) notFound();

  const debutMois = startOfMonth(now);
  const finMois = endOfMonth(now);

  const moisReservations = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        checkoutValideAt: reservations.checkoutValideAt,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, debutMois), lte(reservations.checkOut, finMois)))
  ).filter((r) => domaineEstActif(r.domaineNom));
  const moisReservationIds = moisReservations.map((r) => r.id);
  const moisReservationById = new Map(moisReservations.map((r) => [r.id, r]));

  const moisAffectations =
    moisReservationIds.length > 0
      ? await db
          .select()
          .from(personnelAffectations)
          .where(and(eq(personnelAffectations.personnelId, id), inArray(personnelAffectations.reservationId, moisReservationIds)))
      : [];

  let totalFait = 0;
  let montantGagne = 0;
  let montantRecu = 0;
  const details: { villaNom: string | null; villaNumero: string | null; guestName: string; montant: number; date: Date; paye: boolean }[] = [];

  for (const a of moisAffectations) {
    const r = moisReservationById.get(a.reservationId);
    if (!r) continue;
    if (p.role === "menage") {
      if (!a.faitAt) continue;
      const montant = montantMenageDu(a.faitAt);
      totalFait += 1;
      montantGagne += montant;
      if (a.payeAt) montantRecu += montant;
      details.push({ villaNom: r.villaNom, villaNumero: r.villaNumero, guestName: r.guestName, montant, date: a.faitAt, paye: Boolean(a.payeAt) });
    } else {
      const montant = montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner);
      if (montant <= 0) continue;
      const jours = a.nbJours ?? Math.max(1, differenceInCalendarDays(new Date(r.checkOut), new Date(r.checkIn)));
      totalFait += jours;
      montantGagne += montant;
      if (a.payeAt) montantRecu += montant;
      details.push({
        villaNom: r.villaNom,
        villaNumero: r.villaNumero,
        guestName: r.guestName,
        montant,
        date: r.checkoutValideAt ?? new Date(r.checkOut),
        paye: Boolean(a.payeAt),
      });
    }
  }
  details.sort((a, b) => b.date.getTime() - a.date.getTime());

  const roleLabel = p.role === "menage" ? "Femme de ménage" : "Cuisinière";
  const uniteLabel =
    p.role === "menage" ? (totalFait > 1 ? "ménages faits" : "ménage fait") : totalFait > 1 ? "jours de cuisine" : "jour de cuisine";

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/personnel" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Retour à Personnel
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.nom}</h1>
          <p className="text-sm text-muted-foreground">
            {roleLabel}
            {!p.actif ? " · Inactif" : ""}
          </p>
        </div>
        {p.telephone ? <PhoneLink phone={p.telephone} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">{format(now, "MMMM yyyy", { locale: fr })}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <Stat label={uniteLabel} value={String(totalFait)} />
          <Stat label="Total gagné" value={`${montantGagne} MAD`} />
          <Stat label="Déjà reçu" value={`${montantRecu} MAD`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail du mois</CardTitle>
        </CardHeader>
        <CardContent>
          {details.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien ce mois-ci pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2">
              {details.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {d.villaNom ? `${d.villaNom} (n°${d.villaNumero})` : "Villa non renseignée"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.guestName} · {format(d.date, "d MMM", { locale: fr })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium">{d.montant} MAD</span>
                    <Badge variant="outline" className="text-xs">
                      {d.paye ? "Payé" : "Dû"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {p.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{p.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
