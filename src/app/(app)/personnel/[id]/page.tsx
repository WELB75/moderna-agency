import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, ne, gte, lte, inArray, ilike } from "drizzle-orm";
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

type MonthReservation = {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  checkoutValideAt: Date | null;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
};

type DetailLigne = { villaNom: string | null; villaNumero: string | null; guestName: string; montant: number; date: Date; paye: boolean };

// Fiche individuelle : une même personne (ex. Touria) peut faire à la fois le ménage et la
// cuisine, chacune enregistrée comme une entrée Personnel séparée (rôle différent) — on les
// regroupe donc ici par nom pour montrer tout sur une seule page, avec les deux totaux bien
// distincts plutôt que d'obliger à naviguer entre deux fiches.
export default async function PersonnelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const now = nowInMorocco();

  const [p] = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
  if (!p) notFound();

  const memePersonne = (await db.select().from(personnel).where(ilike(personnel.nom, p.nom))).sort((a, b) =>
    a.role === "menage" ? -1 : b.role === "menage" ? 1 : 0
  );

  const debutMois = startOfMonth(now);
  const finMois = endOfMonth(now);

  const moisReservations: MonthReservation[] = (
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

  async function computeStats(personnelId: string, role: "menage" | "cuisine") {
    const moisAffectations =
      moisReservationIds.length > 0
        ? await db
            .select()
            .from(personnelAffectations)
            .where(and(eq(personnelAffectations.personnelId, personnelId), inArray(personnelAffectations.reservationId, moisReservationIds)))
        : [];

    let totalFait = 0;
    let montantGagne = 0;
    let montantRecu = 0;
    const details: DetailLigne[] = [];

    for (const a of moisAffectations) {
      const r = moisReservationById.get(a.reservationId);
      if (!r) continue;
      if (role === "menage") {
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
    return { totalFait, montantGagne, montantRecu, details };
  }

  const sections = await Promise.all(
    memePersonne.map(async (entry) => ({ entry, stats: await computeStats(entry.id, entry.role) }))
  );

  const telephone = memePersonne.find((e) => e.telephone)?.telephone ?? null;
  const roleLabels = memePersonne.map((e) => (e.role === "menage" ? "Femme de ménage" : "Cuisinière"));
  const inactive = memePersonne.every((e) => !e.actif);

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
            {roleLabels.join(" & ")}
            {inactive ? " · Inactif" : ""}
          </p>
        </div>
        {telephone ? <PhoneLink phone={telephone} /> : null}
      </div>

      <p className="text-sm text-muted-foreground capitalize">{format(now, "MMMM yyyy", { locale: fr })}</p>

      {sections.map(({ entry, stats }) => {
        const roleLabel = entry.role === "menage" ? "Ménage" : "Cuisine";
        const uniteLabel =
          entry.role === "menage"
            ? stats.totalFait > 1
              ? "ménages faits"
              : "ménage fait"
            : stats.totalFait > 1
              ? "jours de cuisine"
              : "jour de cuisine";

        return (
          <Card key={entry.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {roleLabel}
                {!entry.actif ? (
                  <Badge variant="outline" className="text-xs">
                    Inactif
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label={uniteLabel} value={String(stats.totalFait)} />
                <Stat label="Total gagné" value={`${stats.montantGagne} MAD`} />
                <Stat label="Déjà reçu" value={`${stats.montantRecu} MAD`} />
              </div>

              {stats.details.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rien ce mois-ci pour l&apos;instant.</p>
              ) : (
                <div className="space-y-2 border-t pt-3">
                  {stats.details.map((d, i) => (
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
        );
      })}

      {memePersonne.some((e) => e.notes) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {memePersonne
              .filter((e) => e.notes)
              .map((e) => (
                <p key={e.id} className="text-sm">
                  {e.notes}
                </p>
              ))}
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
