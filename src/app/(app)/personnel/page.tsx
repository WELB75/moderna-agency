import { asc, and, ne, gte, lte, eq, inArray, isNull, or } from "drizzle-orm";
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, subDays } from "date-fns";
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
import { deletePersonnel } from "@/lib/actions/personnel";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { nowInMorocco } from "@/lib/now";
import { Users, CalendarClock, BarChart3, LogIn, LogOut, type LucideIcon } from "lucide-react";

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
        const mine = moisAffectations.filter((a) => a.personnelId === p.id && a.faitAt);
        const villaIds = mine.map((a) => moisReservationById.get(a.reservationId)?.villaId).filter((v): v is string => Boolean(v));
        return { id: p.id, nom: p.nom, actif: p.actif, total: mine.length, villasDistinctes: new Set(villaIds).size };
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
          />
        </TabsContent>

        <TabsContent value="statistiques" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {format(now, "MMMM yyyy", { locale: fr })} — pour comparer la charge entre le personnel.
          </p>
          <StatsSection
            title="Femmes de ménage"
            rows={statsMenage}
            unit="ménage confirmé"
            unitPlural="ménages confirmés"
          />
          <StatsSection title="Cuisinières" rows={statsCuisine} unit="jour de cuisine" unitPlural="jours de cuisine" />
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
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="space-y-2">
            {list.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {item.villaNom ? `${item.villaNom} (n°${item.villaNumero})` : "Villa non renseignée"}
                  </p>
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
            ))}
          </div>
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

function StatsSection({
  title,
  rows,
  unit,
  unitPlural,
}: {
  title: string;
  rows: { id: string; nom: string; actif: boolean; total: number; villasDistinctes: number }[];
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
