import { asc, desc, eq, ne } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { demandesServices } from "@/db/schema-services";
import { DemandeServiceActions } from "@/components/app/demande-service-actions";
import { CopierLienServices } from "@/components/app/copier-lien-services";
import { HEURE_FLEXIBLE } from "@/lib/services-catalogue";

export const dynamic = "force-dynamic";

const LIBELLE = { demandee: "En attente", confirmee: "Confirmée", refusee: "Indisponible", terminee: "Terminée" } as const;
const CLASSE = {
  demandee: "bg-amber-100 text-amber-800",
  confirmee: "bg-emerald-100 text-emerald-800",
  refusee: "bg-red-100 text-red-800",
  terminee: "bg-muted text-muted-foreground",
} as const;

// Demandes de services et d'activités faites par les voyageurs depuis leur lien /sejour/[id] :
// à confirmer (disponibilité, prix) par WhatsApp, puis à marquer ici.
export default async function DemandesPage() {
  const rows = await getDb()
    .select({
      id: demandesServices.id,
      reservationId: demandesServices.reservationId,
      label: demandesServices.serviceLabel,
      jour: demandesServices.jour,
      heure: demandesServices.heure,
      nb: demandesServices.nbPersonnes,
      note: demandesServices.note,
      statut: demandesServices.statut,
      guestName: reservations.guestName,
      villaNom: villas.nom,
    })
    .from(demandesServices)
    .innerJoin(reservations, eq(demandesServices.reservationId, reservations.id))
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(ne(reservations.status, "annulee"))
    .orderBy(desc(demandesServices.createdAt), asc(demandesServices.jour));

  const enAttente = rows.filter((r) => r.statut === "demandee");
  const autres = rows.filter((r) => r.statut !== "demandee");

  const parResa = (liste: typeof rows) => {
    const m = new Map<string, typeof rows>();
    for (const r of liste) m.set(r.reservationId, [...(m.get(r.reservationId) ?? []), r]);
    return [...m.values()];
  };

  const bloc = (groupe: typeof rows) => (
    <div key={groupe[0].reservationId} className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
        <span className="font-semibold">{groupe[0].guestName}</span>
        <span className="text-sm text-muted-foreground">{groupe[0].villaNom ?? "Logement non renseigné"}</span>
        <span className="ml-auto">
          <CopierLienServices reservationId={groupe[0].reservationId} />
        </span>
      </div>
      <ul className="divide-y">
        {groupe.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.label}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSE[r.statut]}`}>{LIBELLE[r.statut]}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(`${r.jour}T00:00:00Z`), "EEEE d MMMM", { locale: fr })} ·{" "}
                {r.heure === HEURE_FLEXIBLE ? "heure flexible" : r.heure} · {r.nb} personne{r.nb > 1 ? "s" : ""}
              </p>
              {r.note ? <p className="text-xs text-amber-700 dark:text-amber-400">{r.note}</p> : null}
            </div>
            <DemandeServiceActions id={r.id} statut={r.statut} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demandes voyageurs</h1>
        <p className="text-sm text-muted-foreground">
          Services et activités choisis par les voyageurs depuis leur lien. Le lien à envoyer se copie depuis ici ou depuis la carte de la réservation.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">À traiter · {enAttente.length}</h2>
        {enAttente.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande en attente.</p> : parResa(enAttente).map(bloc)}
      </section>
      {autres.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Déjà traitées · {autres.length}</h2>
          {parResa(autres).map(bloc)}
        </section>
      ) : null}
    </div>
  );
}
