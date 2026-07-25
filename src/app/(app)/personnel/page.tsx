import { asc, and, ne, gte, lte, eq, inArray, isNull, or } from "drizzle-orm";
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, subDays, startOfDay, isSameDay, isBefore, isAfter } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddPersonnelDialog } from "@/components/app/add-personnel-dialog";
import { EditPersonnelDialog } from "@/components/app/edit-personnel-dialog";
import { PersonnelActifToggle } from "@/components/app/personnel-actif-toggle";
import { PersonnelAffectationEditor, type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { PhoneLink } from "@/components/app/phone-link";
import { MarkPaidButton } from "@/components/app/mark-paid-button";
import { deletePersonnel } from "@/lib/actions/personnel";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";
import { montantMenageDu, montantCuisineDu } from "@/lib/personnel-tarifs";
import { Users, CalendarClock, BarChart3, Wallet, LogIn, LogOut, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function PersonnelPage() {
  const db = getDb();
  const now = nowInMorocco();

  const allPersonnel = await db.select().from(personnel).orderBy(asc(personnel.nom));
  const menageRoster = allPersonnel.filter((p) => p.role === "menage");
  const cuisineRoster = allPersonnel.filter((p) => p.role === "cuisine");
  const menageOptions = menageRoster.filter((p) => p.actif).map((p) => ({ id: p.id, nom: p.nom }));
  const cuisineOptions = cuisineRoster.filter((p) => p.actif).map((p) => ({ id: p.id, nom: p.nom }));
  const personnelById = new Map(allPersonnel.map((p) => [p.id, p]));

  // Séparé en deux listes distinctes plutôt qu'une seule "à venir" mélangeant les deux dates :
  // la cuisine se prépare pour une arrivée, le ménage se fait après un départ. On garde une
  // entrée visible tant que le check-in/check-out n'est pas validé, OU si il vient d'être
  // validé récemment (le ménage se fait juste après un départ réel, même anticipé — ex.
  // propriétaire parti plus tôt que prévu, on doit encore pouvoir affecter qui nettoie).
  const fenetreBasse = subDays(now, 2);
  const arrivees = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(
        and(
          ne(reservations.status, "annulee"),
          gte(reservations.checkIn, fenetreBasse),
          or(isNull(reservations.checkinValideAt), gte(reservations.checkinValideAt, fenetreBasse))
        )
      )
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => domaineEstActif(r.domaineNom));

  const departs = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkOut: reservations.checkOut,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(
        and(
          ne(reservations.status, "annulee"),
          gte(reservations.checkOut, fenetreBasse),
          or(isNull(reservations.checkoutValideAt), gte(reservations.checkoutValideAt, fenetreBasse))
        )
      )
      .orderBy(asc(reservations.checkOut))
  ).filter((r) => domaineEstActif(r.domaineNom));

  const affectationIds = Array.from(new Set([...arrivees.map((r) => r.id), ...departs.map((r) => r.id)]));
  const upcomingAffectations =
    affectationIds.length > 0
      ? await db.select().from(personnelAffectations).where(inArray(personnelAffectations.reservationId, affectationIds))
      : [];
  const affectationsByReservation = new Map<
    string,
    { affectationId: string; personnelId: string; role: string; faitAt: Date | null; nbJours: number | null }[]
  >();
  for (const a of upcomingAffectations) {
    const p = personnelById.get(a.personnelId);
    if (!p) continue;
    const list = affectationsByReservation.get(a.reservationId) ?? [];
    list.push({ affectationId: a.id, personnelId: a.personnelId, role: p.role, faitAt: a.faitAt, nbJours: a.nbJours });
    affectationsByReservation.set(a.reservationId, list);
  }
  function assignedFor(reservationId: string, role: "menage" | "cuisine"): PersonnelAssigne[] {
    return (affectationsByReservation.get(reservationId) ?? [])
      .filter((a) => a.role === role)
      .map((a) => ({
        affectationId: a.affectationId,
        personnelId: a.personnelId,
        nom: personnelById.get(a.personnelId)!.nom,
        faitAt: a.faitAt,
        nbJours: a.nbJours,
      }));
  }

  // Statistiques du mois en cours : pour le ménage, on ne compte que les affectations
  // confirmées faites (pas juste assignées) ; pour la cuisine, le nombre de jours réels
  // (nbJours si renseigné, sinon la durée du séjour) — pour repérer les déséquilibres.
  const debutMois = startOfMonth(now);
  const finMois = endOfMonth(now);
  const moisReservations = (
    await db
      .select({
        id: reservations.id,
        villaId: reservations.villaId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
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
      ? await db.select().from(personnelAffectations).where(inArray(personnelAffectations.reservationId, moisReservationIds))
      : [];

  function computeStatsMenage(roster: typeof allPersonnel) {
    return roster
      .map((p) => {
        const mine = moisAffectations.filter((a) => a.personnelId === p.id);
        const confirmes = mine.filter((a) => a.faitAt).length;
        const villaIds = mine.map((a) => moisReservationById.get(a.reservationId)?.villaId).filter((v): v is string => Boolean(v));
        return { id: p.id, nom: p.nom, actif: p.actif, total: mine.length, confirmes, villasDistinctes: new Set(villaIds).size };
      })
      .sort((a, b) => b.total - a.total);
  }

  function computeStatsCuisine(roster: typeof allPersonnel) {
    return roster
      .map((p) => {
        const mine = moisAffectations.filter((a) => a.personnelId === p.id);
        const villaIds = mine.map((a) => moisReservationById.get(a.reservationId)?.villaId).filter((v): v is string => Boolean(v));
        const totalJours = mine.reduce((sum, a) => {
          const r = moisReservationById.get(a.reservationId);
          if (!r) return sum;
          const jours = a.nbJours ?? Math.max(1, differenceInCalendarDays(new Date(r.checkOut), new Date(r.checkIn)));
          return sum + jours;
        }, 0);
        return { id: p.id, nom: p.nom, actif: p.actif, total: totalJours, villasDistinctes: new Set(villaIds).size };
      })
      .sort((a, b) => b.total - a.total);
  }
  const statsMenage = computeStatsMenage(menageRoster);
  const statsCuisine = computeStatsCuisine(cuisineRoster);

  // Paiements dus (200 MAD/ménage confirmé, 200 MAD/jour de cuisine) : sur toutes les
  // affectations pas encore payées, pas seulement le mois en cours — une dette ne doit pas
  // disparaître simplement parce qu'on a changé de mois.
  const unpaidAffectations = await db.select().from(personnelAffectations).where(isNull(personnelAffectations.payeAt));
  const unpaidReservationIds = Array.from(new Set(unpaidAffectations.map((a) => a.reservationId)));
  const unpaidReservations =
    unpaidReservationIds.length > 0
      ? await db
          .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut, checkoutValideAt: reservations.checkoutValideAt })
          .from(reservations)
          .where(inArray(reservations.id, unpaidReservationIds))
      : [];
  const unpaidReservationById = new Map(unpaidReservations.map((r) => [r.id, r]));

  function computeDus(roster: typeof allPersonnel, role: "menage" | "cuisine") {
    return roster
      .map((p) => {
        const mine = unpaidAffectations.filter((a) => a.personnelId === p.id);
        let montant = 0;
        const affectationIds: string[] = [];
        for (const a of mine) {
          const r = unpaidReservationById.get(a.reservationId);
          if (!r) continue;
          const m =
            role === "menage"
              ? montantMenageDu(a.faitAt)
              : montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt);
          if (m > 0) {
            montant += m;
            affectationIds.push(a.id);
          }
        }
        return { id: p.id, nom: p.nom, actif: p.actif, montant, affectationIds };
      })
      .sort((a, b) => b.montant - a.montant);
  }
  const dusMenage = computeDus(menageRoster, "menage");
  const dusCuisine = computeDus(cuisineRoster, "cuisine");
  const totalDu = [...dusMenage, ...dusCuisine].reduce((sum, r) => sum + r.montant, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Personnel</h1>
        <p className="text-sm text-muted-foreground">Femmes de ménage et cuisinières — affectations et suivi</p>
      </div>

      <Tabs defaultValue="equipe">
        <TabsList>
          <TabsTrigger value="equipe">
            <Users className="h-4 w-4" />
            Équipe
          </TabsTrigger>
          <TabsTrigger value="affectations">
            <CalendarClock className="h-4 w-4" />
            Affectations
          </TabsTrigger>
          <TabsTrigger value="statistiques">
            <BarChart3 className="h-4 w-4" />
            Statistiques
          </TabsTrigger>
          <TabsTrigger value="paiements">
            <Wallet className="h-4 w-4" />
            Paiements
            {totalDu > 0 ? <Badge className="ml-1">{totalDu} MAD</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipe" className="space-y-6">
          <RosterSection title="Femmes de ménage" role="menage" people={menageRoster} />
          <RosterSection title="Cuisinières" role="cuisine" people={cuisineRoster} />
        </TabsContent>

        <TabsContent value="affectations" className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Départs en premier : c'est le plus urgent, la villa doit être prête avant l'arrivée
              suivante. Les deux colonnes restent visibles côte à côte sur grand écran, sans
              devoir scroller jusqu'en bas pour retrouver le ménage. */}
          <AffectationSection
            title="Départs"
            description="Un client part : qui fait le ménage juste après ?"
            icon={LogOut}
            list={departs}
            dateLabel="départ"
            getDate={(r) => r.checkOut}
            role="menage"
            label="Ménage"
            options={menageOptions}
            assignedFor={assignedFor}
            emptyLabel="Aucun départ en attente."
            now={now}
          />
          <AffectationSection
            title="Arrivées"
            description="Un client arrive : qui s'occupe de la cuisine pendant son séjour (si besoin) ?"
            icon={LogIn}
            list={arrivees}
            dateLabel="arrivée"
            getDate={(r) => r.checkIn}
            role="cuisine"
            label="Cuisine"
            options={cuisineOptions}
            assignedFor={assignedFor}
            emptyLabel="Aucune arrivée en attente."
            now={now}
          />
        </TabsContent>

        <TabsContent value="statistiques" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {format(now, "MMMM yyyy", { locale: fr })} — pour comparer la charge entre le personnel.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Leaderboard title="Classement ménage" rows={statsMenage} unit="ménage" unitPlural="ménages" />
            <Leaderboard title="Classement cuisine" rows={statsCuisine} unit="jour" unitPlural="jours" />
          </div>

          <StatsSection title="Femmes de ménage" rows={statsMenage} unit="ménage affecté" unitPlural="ménages affectés" />
          <StatsSection title="Cuisinières" rows={statsCuisine} unit="jour de cuisine" unitPlural="jours de cuisine" />
        </TabsContent>

        <TabsContent value="paiements" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Ménage : 200 MAD par personne une fois le ménage confirmé fait. Cuisine : 200 MAD par jour, dû au
            check-out du client. Total à prévoir en liquide : <span className="font-semibold text-foreground">{totalDu} MAD</span>.
          </p>
          <PaymentsSection title="Femmes de ménage" rows={dusMenage} />
          <PaymentsSection title="Cuisinières" rows={dusCuisine} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AffectationSection<T extends { id: string; guestName: string; villaNom: string | null; villaNumero: string | null }>({
  title,
  description,
  icon: Icon,
  list,
  dateLabel,
  getDate,
  role,
  label,
  options,
  assignedFor,
  emptyLabel,
  now,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  list: T[];
  dateLabel: string;
  getDate: (item: T) => Date;
  role: "menage" | "cuisine";
  label: string;
  options: { id: string; nom: string }[];
  assignedFor: (reservationId: string, role: "menage" | "cuisine") => PersonnelAssigne[];
  emptyLabel: string;
  now: Date;
}) {
  const today = startOfDay(now);
  // Priorité à aujourd'hui : c'est ce qu'il faut faire maintenant. Le reste à venir suit en
  // dessous ; le passé (déjà dû, pas encore traité) est gardé mais replié — toujours compté
  // dans les statistiques, juste plus en travers du quotidien.
  const enRetard = list.filter((item) => isBefore(startOfDay(getDate(item)), today));
  const aujourdhui = list.filter((item) => isSameDay(getDate(item), today));
  const aVenir = list.filter((item) => isAfter(startOfDay(getDate(item)), today));

  function renderItem(item: T) {
    return (
      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <p className="font-medium">{item.villaNom ? `${item.villaNom} (n°${item.villaNumero})` : "Villa non renseignée"}</p>
          <p className="text-sm text-muted-foreground">
            {item.guestName} · {dateLabel} le {format(getDate(item), "d MMM yyyy", { locale: fr })}
          </p>
        </div>
        <PersonnelAffectationEditor
          reservationId={item.id}
          role={role}
          label={label}
          assigned={assignedFor(item.id, role)}
          options={options}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Aujourd&apos;hui · {format(today, "d MMMM", { locale: fr })}
              </p>
              {aujourdhui.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rien pour aujourd&apos;hui.</p>
              ) : (
                <div className="space-y-2">{aujourdhui.map(renderItem)}</div>
              )}
            </div>

            {aVenir.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">À venir</p>
                <div className="space-y-2">{aVenir.map(renderItem)}</div>
              </div>
            ) : null}

            {enRetard.length > 0 ? (
              <details className="group rounded-md border">
                <summary className="cursor-pointer list-none p-3 text-sm font-medium text-muted-foreground marker:content-none">
                  En retard ({enRetard.length}) — pas encore traité
                </summary>
                <div className="space-y-2 border-t p-3">{enRetard.map(renderItem)}</div>
              </details>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RosterSection({
  title,
  role,
  people,
}: {
  title: string;
  role: "menage" | "cuisine";
  people: (typeof personnel.$inferSelect)[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <AddPersonnelDialog defaultRole={role} />
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Personne enregistrée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium">{p.nom}</p>
                    {!p.actif ? <Badge variant="outline">Inactif</Badge> : null}
                  </div>
                  {p.telephone ? <PhoneLink phone={p.telephone} /> : null}
                  {p.notes ? <p className="mt-0.5 text-sm text-muted-foreground">{p.notes}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <EditPersonnelDialog personnelId={p.id} nom={p.nom} telephone={p.telephone} notes={p.notes} />
                  <PersonnelActifToggle personnelId={p.id} actif={p.actif} />
                  <ConfirmDeleteButton
                    action={deletePersonnel.bind(null, p.id)}
                    title={`Supprimer ${p.nom} ?`}
                    description="Ses affectations passées perdront le lien vers son nom. Préfère désactiver plutôt que supprimer si elle a déjà travaillé."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RANK_STYLES = [
  { badge: "bg-amber-500 text-white", row: "border-amber-500/40 bg-amber-500/5" },
  { badge: "bg-zinc-400 text-white", row: "border-zinc-400/40 bg-zinc-400/5" },
  { badge: "bg-orange-700 text-white", row: "border-orange-700/30 bg-orange-700/5" },
];

function Leaderboard({
  title,
  rows,
  unit,
  unitPlural,
}: {
  title: string;
  rows: { id: string; nom: string; actif: boolean; total: number }[];
  unit: string;
  unitPlural: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Personne enregistrée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const style = RANK_STYLES[i];
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-2.5",
                    style ? style.row : "border-border"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      style ? style.badge : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-medium">
                    {r.nom}
                    {!r.actif ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inactif)</span> : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">
                    {r.total} <span className="font-normal text-muted-foreground">{r.total > 1 ? unitPlural : unit}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatsSection({
  title,
  rows,
  unit,
  unitPlural,
}: {
  title: string;
  rows: { id: string; nom: string; actif: boolean; total: number; confirmes?: number; villasDistinctes: number }[];
  unit: string;
  unitPlural: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Personne enregistrée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">{r.nom}</p>
                  {!r.actif ? <Badge variant="outline">Inactif</Badge> : null}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {r.total} {r.total > 1 ? unitPlural : unit}
                  </Badge>
                  {r.confirmes !== undefined ? (
                    <Badge
                      variant="outline"
                      className={
                        r.confirmes > 0
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      {r.confirmes} confirmé{r.confirmes > 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                  <span>
                    {r.villasDistinctes} villa{r.villasDistinctes > 1 ? "s" : ""} différente
                    {r.villasDistinctes > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentsSection({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; nom: string; actif: boolean; montant: number; affectationIds: string[] }[];
}) {
  const withDue = rows.filter((r) => r.montant > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {withDue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à payer pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {withDue.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">{r.nom}</p>
                  {!r.actif ? <Badge variant="outline">Inactif</Badge> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-600 hover:bg-amber-600">{r.montant} MAD dus</Badge>
                  <MarkPaidButton affectationIds={r.affectationIds} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
