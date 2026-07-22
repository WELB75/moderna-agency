import { eq, asc, desc, gte, and, or, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import {
  villas,
  reservations,
  interventions,
  domaines,
  proprieteContacts,
  interventionComments,
  paiementsProprietaire,
  paiementComments,
  technicians,
} from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InterventionPublicCard } from "@/components/app/intervention-public-card";
import { PaiementComments } from "@/components/app/paiement-comments";
import { AddTravauxRequestDialog } from "@/components/app/add-travaux-request-dialog";
import { OwnerTeamSection } from "@/components/app/owner-team-section";
import { AddOwnerContactDialog } from "@/components/app/add-owner-contact-dialog";
import { OwnerStayCalendar } from "@/components/app/owner-stay-calendar";
import { CategorieFilterView, type CategorieGroup } from "@/components/app/categorie-filter-view";
import { LinkifiedText } from "@/components/app/linkified-text";
import { sortByUrgence } from "@/lib/intervention-urgence";
import { CATEGORIES } from "@/lib/intervention-categorie";
import { CalendarDays, Wrench, Users, Eye, Wallet } from "lucide-react";

// Point de départ du suivi : l'agence ne gère pas ces biens avant cette date,
// les réservations antérieures ne sont pas rattachables à sa gestion.
const PORTAL_START_DATE = new Date(Date.UTC(2026, 6, 1));

export default async function ProprietaireAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const [villa] = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
      domaineId: villas.domaineId,
      proprietaireNom: villas.proprietaireNom,
      portailAuteurs: villas.portailAuteurs,
      photoUrl: villas.photoUrl,
    })
    .from(villas)
    .where(eq(villas.lienProprietaireToken, token))
    .limit(1);

  if (!villa) notFound();

  const commentAuthorOptions =
    villa.portailAuteurs && villa.portailAuteurs.length > 0
      ? villa.portailAuteurs
      : [villa.proprietaireNom || "Propriétaire", "Kamel"];

  const villaReservations = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.villaId, villa.id), gte(reservations.checkIn, PORTAL_START_DATE)))
    .orderBy(asc(reservations.checkIn))
    .limit(100);

  const villaInterventions = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      lieu: interventions.lieu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      prestataire: interventions.prestataire,
      urgence: interventions.urgence,
      categorie: interventions.categorie,
      etape: interventions.etape,
      notes: interventions.notes,
      attachmentUrls: interventions.attachmentUrls,
      devis: interventions.devis,
      signaleAt: interventions.signaleAt,
      contacteAt: interventions.contacteAt,
      planifieAt: interventions.planifieAt,
      debutAt: interventions.debutAt,
      finAt: interventions.finAt,
      validationStatut: interventions.validationStatut,
      validationNote: interventions.validationNote,
      validationAt: interventions.validationAt,
      origine: interventions.origine,
      createdAt: interventions.createdAt,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .where(eq(interventions.villaId, villa.id))
    .orderBy(desc(interventions.createdAt));

  const mesDemandes = sortByUrgence(villaInterventions.filter((i) => i.origine === "proprietaire"));
  const constatsEquipe = sortByUrgence(villaInterventions.filter((i) => i.origine !== "proprietaire"));

  const interventionIds = villaInterventions.map((i) => i.id);
  const allComments =
    interventionIds.length > 0
      ? await db
          .select()
          .from(interventionComments)
          .where(inArray(interventionComments.interventionId, interventionIds))
          .orderBy(interventionComments.createdAt)
      : [];
  const commentsByIntervention = new Map<string, typeof allComments>();
  for (const c of allComments) {
    const list = commentsByIntervention.get(c.interventionId) ?? [];
    list.push(c);
    commentsByIntervention.set(c.interventionId, list);
  }

  const villaContacts = await db
    .select({
      id: proprieteContacts.id,
      role: proprieteContacts.role,
      nom: proprieteContacts.nom,
      telephone: proprieteContacts.telephone,
    })
    .from(proprieteContacts)
    .where(
      villa.domaineId
        ? or(eq(proprieteContacts.villaId, villa.id), eq(proprieteContacts.domaineId, villa.domaineId))
        : eq(proprieteContacts.villaId, villa.id)
    );

  const allTechnicians = await db
    .select({ id: technicians.id, nom: technicians.nom, fonction: technicians.fonction, telephone: technicians.telephone })
    .from(technicians)
    .orderBy(technicians.nom);

  const villaPaiements = await db
    .select()
    .from(paiementsProprietaire)
    .where(eq(paiementsProprietaire.villaId, villa.id))
    .orderBy(desc(paiementsProprietaire.createdAt));

  const paiementIds = villaPaiements.map((p) => p.id);
  const allPaiementComments =
    paiementIds.length > 0
      ? await db
          .select()
          .from(paiementComments)
          .where(inArray(paiementComments.paiementId, paiementIds))
          .orderBy(paiementComments.createdAt)
      : [];
  const commentsByPaiement = new Map<string, typeof allPaiementComments>();
  for (const c of allPaiementComments) {
    const list = commentsByPaiement.get(c.paiementId) ?? [];
    list.push(c);
    commentsByPaiement.set(c.paiementId, list);
  }

  const paiementsEnAttente = villaPaiements.filter((p) => p.statut === "en_attente").length;

  const demandesActives = mesDemandes.filter((i) => i.etape !== "termine").length;
  const constatsActifs = constatsEquipe.filter((i) => i.etape !== "termine").length;
  const now = new Date();
  const sejoursActuelsEtFuturs = villaReservations.filter(
    (r) => r.status !== "annulee" && new Date(r.checkOut) >= now
  );

  function renderCards(items: typeof villaInterventions) {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>;
    }
    return (
      <div className="space-y-4">
        {items.map((i) => (
          <InterventionPublicCard
            key={i.id}
            intervention={i}
            showVillaInfo={false}
            validationTitle="Validez-vous ce devis ?"
            comments={commentsByIntervention.get(i.id) ?? []}
            commentAuteur={villa.proprietaireNom || "Propriétaire"}
            commentAuteurType="proprietaire"
            commentAuthorOptions={commentAuthorOptions}
          />
        ))}
      </div>
    );
  }

  // Sépare en cours / terminé pour ne pas mélanger l'historique clos avec ce qui reste à suivre.
  function renderInterventionList(list: typeof villaInterventions) {
    const enCours = list.filter((i) => i.etape !== "termine");
    const terminees = list.filter((i) => i.etape === "termine");

    return (
      <Tabs defaultValue="en_cours">
        <TabsList>
          <TabsTrigger value="en_cours">
            En cours
            {enCours.length > 0 ? <Badge className="ml-1">{enCours.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="termine">
            Terminé
            {terminees.length > 0 ? (
              <Badge variant="outline" className="ml-1">
                {terminees.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="en_cours" className="pt-3">
          {renderCards(enCours)}
        </TabsContent>
        <TabsContent value="termine" className="pt-3">
          {renderCards(terminees)}
        </TabsContent>
      </Tabs>
    );
  }

  // Regroupe par catégorie : au premier coup d'œil on ne voit que les tuiles de
  // catégorie, on clique dessus pour tomber sur le détail en cours/terminé.
  function renderCategorieGroups(list: typeof villaInterventions): CategorieGroup[] {
    return CATEGORIES.map((c): CategorieGroup | null => {
      const items = list.filter((i) => i.categorie === c.key);
      if (items.length === 0) return null;
      const count = items.filter((i) => i.etape !== "termine").length;
      return { categorie: c.key, count, content: renderInterventionList(items) };
    }).filter((g): g is CategorieGroup => g !== null);
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">Espace propriétaire</p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {villa.photoUrl ? (
          <div className="relative aspect-video w-full">
            <Image
              src={villa.photoUrl}
              alt={villa.nom}
              fill
              sizes="(max-width: 1024px) 100vw, 768px"
              className="object-cover"
              priority
            />
          </div>
        ) : null}
        <div className="bg-card p-4 sm:p-6">
          <h1 className="text-xl font-bold sm:text-2xl">
            {villa.nom} (n°{villa.numero})
          </h1>
          <p className="text-sm text-muted-foreground">{villa.proprietaireNom ? `Bienvenue, ${villa.proprietaireNom}` : "Bienvenue"}</p>
        </div>
      </div>

      <Tabs defaultValue="sejours">
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="sejours" className="shrink-0">
            <CalendarDays className="h-4 w-4" />
            Séjours
          </TabsTrigger>
          <TabsTrigger value="travaux" className="shrink-0">
            <Wrench className="h-4 w-4" />
            Travaux
            {demandesActives > 0 ? <Badge className="ml-1">{demandesActives}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="constats" className="shrink-0">
            <Eye className="h-4 w-4" />
            Constats
            {constatsActifs > 0 ? <Badge className="ml-1">{constatsActifs}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="paiement" className="shrink-0">
            <Wallet className="h-4 w-4" />
            Paiement
            {paiementsEnAttente > 0 ? <Badge className="ml-1">{paiementsEnAttente}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="equipe" className="shrink-0">
            <Users className="h-4 w-4" />
            Équipe
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sejours" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">Dates auxquelles votre logement est loué.</p>
          <OwnerStayCalendar
            stays={sejoursActuelsEtFuturs.map((r) => ({ checkIn: new Date(r.checkIn), checkOut: new Date(r.checkOut) }))}
            now={now}
          />
          {sejoursActuelsEtFuturs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Aucun séjour à venir pour l&apos;instant.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Détail des séjours
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sejoursActuelsEtFuturs.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="flex items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium">
                          {format(new Date(r.checkIn), "d MMM yyyy", { locale: fr })} →{" "}
                          {format(new Date(r.checkOut), "d MMM yyyy", { locale: fr })}
                        </p>
                        <p className="text-sm text-muted-foreground">{r.canal || "Réservation"}</p>
                      </div>
                      <Badge>Loué</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="travaux" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Vos demandes de travaux. Vous pouvez échanger avec l&apos;équipe sur chaque demande.
            </p>
            <AddTravauxRequestDialog villaId={villa.id} />
          </div>
          {mesDemandes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>
          ) : (
            <CategorieFilterView groups={renderCategorieGroups(mesDemandes)} />
          )}
        </TabsContent>

        <TabsContent value="constats" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Ce que l&apos;équipe a constaté sur place (dégâts, entretien, réparations...). Échangez directement
            ci-dessous si besoin.
          </p>
          {constatsEquipe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>
          ) : (
            <CategorieFilterView groups={renderCategorieGroups(constatsEquipe)} />
          )}
        </TabsContent>

        <TabsContent value="paiement" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">Ce que Moderna Agency doit vous reverser.</p>
          {villaPaiements.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Cette section est en cours de mise en place. Elle sera bientôt disponible.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {villaPaiements.map((p) => (
                <Card key={p.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{p.titre}</p>
                      <Badge
                        variant="outline"
                        className={
                          p.statut === "paye"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }
                      >
                        {p.statut === "paye" ? "Payé" : "En attente"}
                      </Badge>
                    </div>
                    {p.montant ? (
                      <p className="text-lg font-semibold">
                        {p.montant} {p.devise}
                      </p>
                    ) : null}
                    {p.description ? (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        <LinkifiedText text={p.description} />
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.createdAt), "d MMM yyyy", { locale: fr })}
                    </p>
                    <PaiementComments
                      paiementId={p.id}
                      comments={commentsByPaiement.get(p.id) ?? []}
                      auteur={villa.proprietaireNom || "Propriétaire"}
                      auteurType="proprietaire"
                      authorOptions={commentAuthorOptions}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="equipe" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">L&apos;équipe qui s&apos;occupe de votre logement.</p>
            <AddOwnerContactDialog villaId={villa.id} technicians={allTechnicians} />
          </div>
          <OwnerTeamSection contacts={villaContacts} />
        </TabsContent>
      </Tabs>

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de consultation Moderna Agency</p>
    </div>
  );
}
