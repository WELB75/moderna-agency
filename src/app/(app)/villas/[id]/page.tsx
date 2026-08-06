import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, ne, and, or, asc, desc, gte, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import {
  villas,
  reservations,
  inventoryChecklists,
  maintenanceRecords,
  technicians,
  domaines,
  gendarmerieForms,
  proprieteContacts,
  interventions,
  cashEntries,
  personnel,
  personnelAffectations,
} from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AddReservationDialog } from "@/components/app/add-reservation-dialog";
import { AddMaintenanceDialog } from "@/components/app/add-maintenance-dialog";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ReservationDates } from "@/components/app/reservation-dates";
import { GuestCount } from "@/components/app/guest-count";
import { VillaPhotoUploader } from "@/components/app/villa-photo-uploader";
import {
  VillaCodeBoitier,
  VillaCodePorteEntree,
  VillaCodeChambreMaster,
  VillaCodeWifi,
  VillaGuideBienvenueUrl,
} from "@/components/app/villa-code-boitier";
import { VillaProprietaire } from "@/components/app/villa-proprietaire";
import { ContactsSection } from "@/components/app/contacts-section";
import { ProprietaireAccessButton } from "@/components/app/proprietaire-access-button";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { VillaIcalUrl } from "@/components/app/villa-ical-url";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { EditVillaInfoDialog } from "@/components/app/edit-villa-info-dialog";
import { PaymentSummary, EditPaymentDialog } from "@/components/app/payment-info";
import { OperationalSummary, EditOperationalInfoDialog } from "@/components/app/operational-info";
import { PersonnelAffectationEditor, type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { GendarmerieAction } from "@/components/app/gendarmerie-action";
import { deleteVilla } from "@/lib/actions/villas";
import { deleteReservation } from "@/lib/actions/reservations";
import { deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import { ClipboardPlus, Info, ChevronRight } from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { phonesMatch } from "@/lib/phone";

export default async function VillaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [villa] = await db
    .select({
      id: villas.id,
      type: villas.type,
      numero: villas.numero,
      nom: villas.nom,
      adresse: villas.adresse,
      numeroImmeuble: villas.numeroImmeuble,
      notes: villas.notes,
      personnelPayeParProprietaireNoms: villas.personnelPayeParProprietaireNoms,
      description: villas.description,
      photoUrl: villas.photoUrl,
      galleryUrls: villas.galleryUrls,
      codeBoitier: villas.codeBoitier,
      codePorteEntree: villas.codePorteEntree,
      codeChambreMaster: villas.codeChambreMaster,
      codeWifi: villas.codeWifi,
      guideBienvenueUrl: villas.guideBienvenueUrl,
      proprietaireNom: villas.proprietaireNom,
      proprietaireTelephone: villas.proprietaireTelephone,
      portailAuteurs: villas.portailAuteurs,
      lienProprietaireToken: villas.lienProprietaireToken,
      icalUrl: villas.icalUrl,
      superhoteListingId: villas.superhoteListingId,
      domaineId: villas.domaineId,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(villas.id, id))
    .limit(1);
  if (!villa) notFound();
  const typeLabel = villa.type === "appartement" ? "Appartement" : "Villa";

  const allDomaines = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines).orderBy(domaines.nom);

  const allPersonnel = await db.select().from(personnel).orderBy(asc(personnel.nom));
  const personnelMenageOptions = allPersonnel.filter((p) => p.role === "menage" && p.actif).map((p) => ({ id: p.id, nom: p.nom }));
  const personnelCuisineOptions = allPersonnel.filter((p) => p.role === "cuisine" && p.actif).map((p) => ({ id: p.id, nom: p.nom }));
  const personnelById = new Map(allPersonnel.map((p) => [p.id, p]));

  const allVillaReservations = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.villaId, id), ne(reservations.status, "annulee")))
    .orderBy(asc(reservations.checkIn));

  const villaReservationIds = allVillaReservations.map((r) => r.id);
  const allAffectations =
    villaReservationIds.length > 0
      ? await db.select().from(personnelAffectations).where(inArray(personnelAffectations.reservationId, villaReservationIds))
      : [];
  const affectationsByReservation = new Map<
    string,
    {
      affectationId: string;
      personnelId: string;
      role: string;
      moment: string;
      faitAt: Date | null;
      nbJours: number | null;
      avecDejeuner: boolean;
      payeAt: Date | null;
      commentaire: string | null;
    }[]
  >();
  for (const a of allAffectations) {
    const p = personnelById.get(a.personnelId);
    if (!p) continue;
    const list = affectationsByReservation.get(a.reservationId) ?? [];
    list.push({
      affectationId: a.id,
      personnelId: a.personnelId,
      role: p.role,
      moment: a.moment,
      faitAt: a.faitAt,
      nbJours: a.nbJours,
      avecDejeuner: a.avecDejeuner,
      payeAt: a.payeAt,
      commentaire: a.commentaire,
    });
    affectationsByReservation.set(a.reservationId, list);
  }
  // Ménage ici = ménage de départ (fin de séjour) ; le ménage sollicité pendant le séjour se gère
  // depuis la carte de check-in du dashboard (voir personnelAffectationMomentEnum, schema.ts).
  function assignedFor(reservationId: string, role: "menage" | "cuisine"): PersonnelAssigne[] {
    return (affectationsByReservation.get(reservationId) ?? [])
      .filter((a) => a.role === role && (role !== "menage" || a.moment === "depart"))
      .map((a) => ({
        affectationId: a.affectationId,
        personnelId: a.personnelId,
        nom: personnelById.get(a.personnelId)!.nom,
        faitAt: a.faitAt,
        nbJours: a.nbJours,
        avecDejeuner: a.avecDejeuner,
        payeAt: a.payeAt,
        commentaire: a.commentaire,
      }));
  }

  const allGendarmerieForms = await db
    .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut, reservationId: gendarmerieForms.reservationId })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.villaId, id));
  const gendarmerieByReservation = new Map(
    allGendarmerieForms.filter((f) => f.reservationId).map((f) => [f.reservationId as string, f])
  );

  const now = nowInMorocco();
  // À venir / en cours : trié du plus proche au plus lointain (le plus urgent en haut).
  const upcomingReservations = allVillaReservations.filter((r) => new Date(r.checkOut) >= now);
  // Passées : la plus récente en premier, reléguées plus bas et repliées.
  const pastReservations = allVillaReservations.filter((r) => new Date(r.checkOut) < now).reverse();

  const checklists = await db
    .select()
    .from(inventoryChecklists)
    .where(eq(inventoryChecklists.villaId, id))
    .orderBy(desc(inventoryChecklists.createdAt));

  const villaMaintenance = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.villaId, id))
    .orderBy(desc(maintenanceRecords.dateIntervention));

  const allTechnicians = await db.select().from(technicians).orderBy(technicians.nom);

  const villaContacts = await db
    .select()
    .from(proprieteContacts)
    .where(
      villa.domaineId
        ? or(eq(proprieteContacts.villaId, id), eq(proprieteContacts.domaineId, villa.domaineId))
        : eq(proprieteContacts.villaId, id)
    )
    .orderBy(asc(proprieteContacts.role));

  // Tous les contacts déjà enregistrés (toutes villas/domaines confondus), pour
  // l'auto-complétion lors de l'ajout d'un nouveau contact (éviter de ressaisir un numéro).
  const allContactsForSuggestions = await db
    .select({ nom: proprieteContacts.nom, telephone: proprieteContacts.telephone, role: proprieteContacts.role })
    .from(proprieteContacts);

  const allInterventionPrestataires = await db
    .select({ prestataire: interventions.prestataire })
    .from(interventions);
  const interventionCounts: Record<string, number> = {};
  for (const row of allInterventionPrestataires) {
    if (!row.prestataire) continue;
    const key = row.prestataire.trim().toLowerCase();
    for (const c of villaContacts) {
      const nameKey = c.nom.trim().toLowerCase();
      if (key.includes(nameKey)) {
        interventionCounts[nameKey] = (interventionCounts[nameKey] ?? 0) + 1;
      }
    }
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthlyDepenses = await db
    .select({ responsable: cashEntries.responsable })
    .from(cashEntries)
    .where(and(eq(cashEntries.type, "depense"), gte(cashEntries.createdAt, monthStart)));
  const paidThisMonth = new Set(
    monthlyDepenses.filter((e) => e.responsable).map((e) => e.responsable!.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {villa.domaineNom ? <DomaineBadge nom={villa.domaineNom} className="mb-1" /> : null}
          <h1 className="text-2xl font-semibold tracking-tight">{villa.nom}</h1>
          <p className="text-sm text-muted-foreground">
            {typeLabel} n°{villa.numero}
            {villa.numeroImmeuble ? ` · Immeuble ${villa.numeroImmeuble}` : ""}
            {villa.adresse ? ` · ${villa.adresse}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <EditVillaInfoDialog
            villaId={villa.id}
            numero={villa.numero}
            nom={villa.nom}
            adresse={villa.adresse}
            numeroImmeuble={villa.numeroImmeuble}
            domaineId={villa.domaineId}
            domaines={allDomaines}
            portailAuteurs={villa.portailAuteurs}
            notes={villa.notes}
            personnelPayeParProprietaireNoms={villa.personnelPayeParProprietaireNoms}
            typeLabel={typeLabel}
          />
          <ConfirmDeleteButton
            action={deleteVilla.bind(null, villa.id)}
            title={`Supprimer ${typeLabel === "Appartement" ? "cet appartement" : "cette villa"} ?`}
            description="Les réservations et inventaires liés seront également supprimés."
            label={`Supprimer ${typeLabel === "Appartement" ? "l'appartement" : "la villa"}`}
          />
        </div>
      </div>

      {villa.notes ? (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{villa.notes}</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <VillaCodeBoitier villaId={villa.id} codeBoitier={villa.codeBoitier} />
        <VillaCodePorteEntree villaId={villa.id} codePorteEntree={villa.codePorteEntree} />
        <VillaCodeChambreMaster villaId={villa.id} codeChambreMaster={villa.codeChambreMaster} />
        <VillaCodeWifi villaId={villa.id} codeWifi={villa.codeWifi} />
        <VillaGuideBienvenueUrl villaId={villa.id} guideBienvenueUrl={villa.guideBienvenueUrl} />
        <VillaProprietaire
          villaId={villa.id}
          proprietaireNom={villa.proprietaireNom}
          proprietaireTelephone={villa.proprietaireTelephone}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProprietaireAccessButton villaId={villa.id} token={villa.lienProprietaireToken} />
        <CopyLinkButton
          path={`/securite/villa/${villa.id}`}
          label="Copier le lien sécurité"
          successMessage="Lien copié — envoie-le une fois à la sécurité, il reste toujours à jour."
        />
      </div>

      <ContactsSection
        contacts={villaContacts}
        interventionCounts={interventionCounts}
        paidThisMonth={paidThisMonth}
        villaId={villa.id}
        domaineId={villa.domaineId}
        domaineNom={villa.domaineNom}
        existingContacts={allContactsForSuggestions}
      />

      <VillaIcalUrl villaId={villa.id} icalUrl={villa.icalUrl} />

      <VillaPhotoUploader villaId={villa.id} photoUrl={villa.photoUrl} />

      {villa.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{villa.description}</p>
          </CardContent>
        </Card>
      ) : null}

      {villa.galleryUrls && villa.galleryUrls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Galerie photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {villa.galleryUrls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-md border">
                  <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/inventaire/nouveau?villaId=${villa.id}&type=entree`}>
            <ClipboardPlus className="h-4 w-4" />
            État des lieux entrée
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/inventaire/nouveau?villaId=${villa.id}&type=sortie`}>
            <ClipboardPlus className="h-4 w-4" />
            État des lieux sortie
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Réservations</CardTitle>
          <AddReservationDialog villaId={villa.id} />
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingReservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune réservation à venir.</p>
          ) : (
            upcomingReservations.map((r) => (
              <ReservationListItem
                key={r.id}
                r={r}
                villaId={villa.id}
                gendarmerieForm={gendarmerieByReservation.get(r.id) ?? null}
                proprietaireTelephone={villa.proprietaireTelephone}
                personnelMenageOptions={personnelMenageOptions}
                personnelCuisineOptions={personnelCuisineOptions}
                menageAssigned={assignedFor(r.id, "menage")}
                cuisineAssigned={assignedFor(r.id, "cuisine")}
                personnelPayeParProprietaireNoms={villa.personnelPayeParProprietaireNoms}
              />
            ))
          )}

          {pastReservations.length > 0 && (
            <details className="group rounded-md border">
              <summary className="cursor-pointer list-none p-3 text-sm font-medium text-muted-foreground marker:content-none">
                <span className="inline-flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  Réservations passées ({pastReservations.length})
                </span>
              </summary>
              <div className="space-y-3 border-t p-3">
                {pastReservations.map((r) => (
                  <ReservationListItem
                    key={r.id}
                    r={r}
                    muted
                    proprietaireTelephone={villa.proprietaireTelephone}
                    personnelMenageOptions={personnelMenageOptions}
                    personnelCuisineOptions={personnelCuisineOptions}
                    menageAssigned={assignedFor(r.id, "menage")}
                    cuisineAssigned={assignedFor(r.id, "cuisine")}
                    personnelPayeParProprietaireNoms={villa.personnelPayeParProprietaireNoms}
                  />
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventaires</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun état des lieux pour cette villa.</p>
          ) : (
            checklists.map((c) => (
              <Link
                key={c.id}
                href={`/inventaire/${c.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:border-primary/50"
              >
                <div>
                  <p className="font-medium">{c.type === "entree" ? "État des lieux d'entrée" : "État des lieux de sortie"}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(c.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                  </p>
                </div>
                <Badge variant={c.status === "signe" ? "default" : "outline"}>
                  {c.status === "signe" ? "Signé" : "Brouillon"}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Maintenance</CardTitle>
          <AddMaintenanceDialog villas={[villa]} technicians={allTechnicians} defaultVillaId={villa.id} />
        </CardHeader>
        <CardContent className="space-y-2">
          {villaMaintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun entretien enregistré.</p>
          ) : (
            villaMaintenance.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{m.categorie}</Badge>
                      <p className="font-medium">{m.equipement}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(m.dateIntervention), "d MMM yyyy", { locale: fr })}
                      {m.prestataire ? ` · ${m.prestataire}` : ""}
                      {m.cout ? ` · ${Number(m.cout).toFixed(2)} DH` : ""}
                    </p>
                    {m.prochaineDatePrevue ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Prochaine échéance :{" "}
                        {format(new Date(m.prochaineDatePrevue), "d MMM yyyy", { locale: fr })}
                      </p>
                    ) : null}
                  </div>
                  <ConfirmDeleteButton
                    action={deleteMaintenanceRecord.bind(null, m.id)}
                    title="Supprimer cet entretien ?"
                    description="Cette action est irréversible."
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Identifiant Superhote (property_key) : {villa.superhoteListingId ?? "non renseigné"}
      </p>
    </div>
  );
}

function ReservationListItem({
  r,
  muted,
  villaId,
  gendarmerieForm,
  proprietaireTelephone,
  personnelMenageOptions,
  personnelCuisineOptions,
  menageAssigned,
  cuisineAssigned,
  personnelPayeParProprietaireNoms,
}: {
  r: typeof reservations.$inferSelect;
  muted?: boolean;
  villaId?: string;
  gendarmerieForm?: { id: string; statut: string } | null;
  proprietaireTelephone?: string | null;
  personnelMenageOptions: { id: string; nom: string }[];
  personnelCuisineOptions: { id: string; nom: string }[];
  menageAssigned: PersonnelAssigne[];
  cuisineAssigned: PersonnelAssigne[];
  personnelPayeParProprietaireNoms?: string[] | null;
}) {
  const isProprietaire = phonesMatch(r.guestPhone, proprietaireTelephone);

  return (
    <div className={"rounded-md border p-3" + (muted ? " opacity-70" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-medium">{r.guestName}</p>
            {isProprietaire ? (
              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                Propriétaire
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {r.canal ? <Badge variant="outline">{r.canal}</Badge> : null}
            <Badge variant={r.source === "manuel" ? "outline" : "secondary"}>
              {r.source === "superhote" ? "Superhote" : r.source === "beds24" ? "Beds24" : "Manuel"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <EditPaymentDialog
            reservationId={r.id}
            loyerTotal={r.loyerTotal}
            montantPaye={r.montantPaye}
            caution={r.caution}
            cautionPayee={r.cautionPayee}
            devisePaiement={r.devisePaiement}
            moyenPaiement={r.moyenPaiement}
            notesPaiement={r.notesPaiement}
          />
          <EditOperationalInfoDialog
            reservationId={r.id}
            assigneCheckin={r.assigneCheckin}
            formulaireBienvenueEnvoye={r.formulaireBienvenueEnvoye}
            formulaireCheckinRecu={r.formulaireCheckinRecu}
            aRelancer={r.aRelancer}
          />
          <ConfirmDeleteButton
            action={deleteReservation.bind(null, r.id)}
            title="Supprimer cette réservation ?"
            description="Cette action est irréversible."
          />
        </div>
      </div>
      <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />
      <ReservationDates checkIn={new Date(r.checkIn)} checkOut={new Date(r.checkOut)} reservationId={r.id} />
      {r.notes ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{r.notes}</span>
        </div>
      ) : null}
      <OperationalSummary
        assigneCheckin={r.assigneCheckin}
        formulaireBienvenueEnvoye={r.formulaireBienvenueEnvoye}
        formulaireCheckinRecu={r.formulaireCheckinRecu}
        aRelancer={r.aRelancer}
      />
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PersonnelAffectationEditor
          reservationId={r.id}
          role="menage"
          moment="depart"
          label="Ménage"
          assigned={menageAssigned}
          options={personnelMenageOptions}
          payeParProprietaireNoms={personnelPayeParProprietaireNoms ?? []}
        />
        <PersonnelAffectationEditor
          reservationId={r.id}
          role="cuisine"
          label="Cuisine"
          assigned={cuisineAssigned}
          options={personnelCuisineOptions}
          payeParProprietaireNoms={personnelPayeParProprietaireNoms ?? []}
        />
      </div>
      {isProprietaire ? null : (
        <div className="mt-2">
          <PaymentSummary
            loyerTotal={r.loyerTotal}
            montantPaye={r.montantPaye}
            caution={r.caution}
            cautionPayee={r.cautionPayee}
            devisePaiement={r.devisePaiement}
          />
        </div>
      )}
      {r.notesPaiement ? <p className="mt-1 text-xs text-muted-foreground">{r.notesPaiement}</p> : null}
      {villaId ? (
        <div className="mt-2">
          <GendarmerieAction reservationId={r.id} villaId={villaId} existingForm={gendarmerieForm ?? null} />
        </div>
      ) : null}
    </div>
  );
}
