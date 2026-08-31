import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { reservations, villas, domaines, gendarmerieForms, contratsLocation, personnel, personnelAffectations, clients } from "@/db/schema";
import { ReservationRowCard, type ReservationRow } from "@/components/app/reservation-row-card";
import { type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { montantMenageDu, montantCuisineDu, estPayeParProprietaire } from "@/lib/personnel-tarifs";
import { phonesMatch } from "@/lib/phone";
import { format } from "date-fns";

// Fiche complète d'une réservation, identique à sa carte du tableau de bord (ménage/cuisine
// éditables, validation check-in/out, documents...), mais accessible directement par id — pour
// que la recherche globale amène précisément ici plutôt que sur la page villa générique.
export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [r] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      canal: reservations.canal,
      notes: reservations.notes,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestPhone: reservations.guestPhone,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
      villaPhotoUrl: villas.photoUrl,
      codeBoitier: villas.codeBoitier,
      codePorteEntree: villas.codePorteEntree,
      codeChambreMaster: villas.codeChambreMaster,
      repasInclusDansLoyer: villas.repasInclusDansLoyer,
      guideBienvenueUrl: villas.guideBienvenueUrl,
      personnelPayeParProprietaireNoms: villas.personnelPayeParProprietaireNoms,
      numeroImmeuble: villas.numeroImmeuble,
      proprietaireTelephone: villas.proprietaireTelephone,
      domaineNom: domaines.nom,
      domaineMapsUrl: domaines.mapsUrl,
      domaineWazeUrl: domaines.wazeUrl,
      domaineSecuritePhone: domaines.securitePhone,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
      checkinValideAt: reservations.checkinValideAt,
      checkinValidePar: reservations.checkinValidePar,
      checkoutValideAt: reservations.checkoutValideAt,
      checkoutValidePar: reservations.checkoutValidePar,
      aRelancer: reservations.aRelancer,
      messageArriveeEnvoyeAt: reservations.messageArriveeEnvoyeAt,
      messageBienvenueEnvoyeAt: reservations.messageBienvenueEnvoyeAt,
      messageLocalisationEnvoyeAt: reservations.messageLocalisationEnvoyeAt,
      messageSecuriteEnvoyeAt: reservations.messageSecuriteEnvoyeAt,
      messageCuisineEnvoyeAt: reservations.messageCuisineEnvoyeAt,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!r) notFound();

  const [fiche] = await db
    .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.reservationId, r.id))
    .limit(1);
  const ficheStatut = fiche ? (fiche.statut === "complete" ? "complete" : "en_attente") : null;
  const ficheId = fiche?.id ?? null;

  let contratStatut: "signe" | "en_attente" | null = null;
  if (r.villaId) {
    const contratsVilla = await db
      .select({ dateArrivee: contratsLocation.dateArrivee, statut: contratsLocation.statut })
      .from(contratsLocation)
      .where(eq(contratsLocation.villaId, r.villaId));
    const dateKey = format(new Date(r.checkIn), "yyyy-MM-dd");
    const matching = contratsVilla.filter((c) => c.dateArrivee === dateKey);
    if (matching.length > 0) {
      contratStatut = matching.some((c) => c.statut === "signe") ? "signe" : "en_attente";
    }
  }

  const affectations = await db
    .select({
      id: personnelAffectations.id,
      personnelId: personnelAffectations.personnelId,
      nom: personnel.nom,
      telephone: personnel.telephone,
      role: personnel.role,
      faitAt: personnelAffectations.faitAt,
      nbJours: personnelAffectations.nbJours,
      avecDejeuner: personnelAffectations.avecDejeuner,
      payeAt: personnelAffectations.payeAt,
      moment: personnelAffectations.moment,
      commentaire: personnelAffectations.commentaire,
      qualiteNote: personnelAffectations.qualiteNote,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
    .where(eq(personnelAffectations.reservationId, r.id));

  const toAssigne = (a: (typeof affectations)[number]): PersonnelAssigne => ({
    affectationId: a.id,
    personnelId: a.personnelId,
    commentaire: a.commentaire,
    nom: a.nom,
    telephone: a.telephone,
    faitAt: a.faitAt,
    nbJours: a.nbJours,
    avecDejeuner: a.avecDejeuner,
    payeAt: a.payeAt,
    qualiteNote: a.qualiteNote,
  });
  const menageSejourAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "menage" && a.moment === "sejour").map(toAssigne);
  const menageDepartAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "menage" && a.moment === "depart").map(toAssigne);
  const cuisineAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "cuisine").map(toAssigne);

  const activePersonnel = await db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom));
  const menageOptions = activePersonnel.filter((p) => p.role === "menage").map((p) => ({ id: p.id, nom: p.nom }));
  const cuisineOptions = activePersonnel.filter((p) => p.role === "cuisine").map((p) => ({ id: p.id, nom: p.nom }));

  const cashAPrevoir = affectations.reduce((sum, a) => {
    if (a.payeAt || estPayeParProprietaire(r.personnelPayeParProprietaireNoms, a.nom)) return sum;
    const montant =
      a.role === "menage"
        ? montantMenageDu(a.faitAt, a.nbJours)
        : montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner);
    return sum + montant;
  }, 0);

  let clientConnu: { nom: string; telephone: string | null; notes: string | null } | null = null;
  if (r.guestPhone) {
    const allClients = await db.select({ nom: clients.nom, telephone: clients.telephone, notes: clients.notes }).from(clients);
    clientConnu = allClients.find((c) => phonesMatch(c.telephone, r.guestPhone)) ?? null;
  }

  const row: ReservationRow = {
    ...r,
    personnelPayeParProprietaireNoms: r.personnelPayeParProprietaireNoms ?? [],
    repasInclusDansLoyer: r.repasInclusDansLoyer ?? false,
    ficheStatut,
    ficheId,
    contratStatut,
    menageSejourAssignes,
    menageDepartAssignes,
    cuisineAssignes,
    menageOptions,
    cuisineOptions,
    cashAPrevoir,
    clientConnu,
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Retour à l&apos;accueil
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{row.guestName}</h1>
        <p className="text-sm text-muted-foreground">
          {row.villaNom ? `${row.villaNom} (n°${row.villaNumero})` : "Villa non renseignée"}
        </p>
      </div>

      <div className="space-y-4">
        <ReservationRowCard r={row} kind="in" />
        <ReservationRowCard r={row} kind="out" />
      </div>
    </div>
  );
}
