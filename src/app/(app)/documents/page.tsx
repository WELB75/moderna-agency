import Image from "next/image";
import Link from "next/link";
import { desc, eq, asc, isNotNull, isNull, ne, and, or, gte, inArray } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, contratsLocation, villas, domaines, reservations } from "@/db/schema";
import { nowInMorocco } from "@/lib/now";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenerateFichePoliceForm } from "@/components/app/generate-fiche-police-form";
import { PassportDropZone } from "@/components/app/passport-drop-zone";
import { GenerateContratForm } from "@/components/app/generate-contrat-form";
import { DocumentRow } from "@/components/app/document-row";
import { PrintButton } from "@/components/app/print-button";
import { DocumentsArrivees } from "@/components/app/documents-arrivees";
import { deleteGendarmerieForm } from "@/lib/actions/gendarmerie";
import { deleteContrat } from "@/lib/actions/contrats";
import { derniereSignatureAgence } from "@/lib/contrat-donnees";
import { sejourSansVoyageur } from "@/lib/conditions-sejour";
import { estContratV1 } from "@/lib/contrat-template";
import { filtrerDomainesActifs, domaineEstActif, idsDomainesActifs, villaEstGeree } from "@/lib/domaines-actifs";
import { CalendarCheck, FilePlus2, History, IdCard, Download } from "lucide-react";

// L'import de passeport (PassportDropZone) lit la MRZ via OCR local (voir passport-ocr.ts) : plus
// lent que le timeout par défaut des Server Actions sur cette page, surtout à froid.
export const maxDuration = 60;

// Documents réorganisé autour du séjour — Fouad, 2026-10-18 ("au niveau document on l'utilise pas
// trop [...] réfléchis à tout ça") :
// - Arrivées (par défaut) : pour chaque séjour en cours / à venir, fiche police + conditions de
//   séjour + caution — remplace les compteurs "fiches générées" qui comptaient les blocages et
//   les fiches pas encore envoyées ;
// - Créer un lien : outils manuels (cas particuliers : réservation directe, client sans lien...) ;
// - Historique : fiches remplies et conditions/contrats ;
// - Pièces d'identité : par défaut les séjours en cours et à venir (ce dont la sécurité a besoin),
//   tout l'historique sur demande.
type Onglet = "arrivees" | "creer" | "historique" | "pieces-identite";

function ongletDepuis(param: string | undefined): Onglet {
  if (param === "creer" || param === "contrat") return "creer";
  if (param === "historique") return "historique";
  if (param === "pieces-identite") return "pieces-identite";
  return "arrivees";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; villaId?: string; reservationId?: string; pieces?: string }>;
}) {
  const { onglet, villaId: villaIdPrerempli, reservationId: reservationIdPrerempli, pieces } = await searchParams;
  const ongletActif = ongletDepuis(onglet);
  const toutesLesPieces = pieces === "tout";
  const db = getDb();
  const now = nowInMorocco();

  const allDomaines = filtrerDomainesActifs(
    await db
      .select({ id: domaines.id, nom: domaines.nom, mapsUrl: domaines.mapsUrl })
      .from(domaines)
      .where(eq(domaines.estBase, false))
      .orderBy(asc(domaines.nom))
  );
  const domaineIdsActifs = idsDomainesActifs(allDomaines);

  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineId: villas.domaineId })
      .from(villas)
      .orderBy(asc(villas.numero))
  ).filter((v) => v.domaineId && domaineIdsActifs.has(v.domaineId) && villaEstGeree(v.nom));
  const villaIdsActifs = new Set(allVillas.map((v) => v.id));

  // Réservations proposées pour pré-remplir les conditions : séjours pas encore terminés, vrais
  // voyageurs uniquement, la prochaine arrivée en premier.
  const reservationsForContrat = (
    await db
      .select({
        id: reservations.id,
        villaId: reservations.villaId,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        nbAdultes: reservations.nbAdultes,
        nbEnfants: reservations.nbEnfants,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        caution: reservations.caution,
        devisePaiement: reservations.devisePaiement,
        canal: reservations.canal,
      })
      .from(reservations)
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, now)))
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => r.villaId && villaIdsActifs.has(r.villaId) && !sejourSansVoyageur(r));

  const signatureAgenceEnregistree = Boolean(await derniereSignatureAgence());

  // Historique : fiches remplies (les fiches en attente sont suivies dans Arrivées) et contrats.
  const fichesRemplies = (
    await db
      .select({
        id: gendarmerieForms.id,
        completedAt: gendarmerieForms.completedAt,
        createdAt: gendarmerieForms.createdAt,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
        guestName: reservations.guestName,
      })
      .from(gendarmerieForms)
      .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
      .where(eq(gendarmerieForms.statut, "complete"))
      .orderBy(desc(gendarmerieForms.completedAt))
      .limit(60)
  ).filter((f) => domaineEstActif(f.domaineNom));

  const contrats = (
    await db
      .select({
        id: contratsLocation.id,
        statut: contratsLocation.statut,
        locataireNom: contratsLocation.locataireNom,
        createdAt: contratsLocation.createdAt,
        signedAt: contratsLocation.signedAt,
        villaId: contratsLocation.villaId,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(contratsLocation)
      .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
      .orderBy(desc(contratsLocation.createdAt))
      .limit(60)
  ).filter((c) => !c.villaId || villaIdsActifs.has(c.villaId));

  const contratIds = contrats.map((c) => c.id);
  const dossierContratIds = new Set(
    contratIds.length > 0
      ? (
          await db
            .select({ contratId: gendarmerieForms.contratId })
            .from(gendarmerieForms)
            .where(inArray(gendarmerieForms.contratId, contratIds))
        )
          .map((f) => f.contratId)
          .filter((id): id is string => Boolean(id))
      : []
  );

  // Pièces d'identité : par défaut, séjours pas encore terminés (ou terminés depuis moins de 2
  // jours) et fiches sans séjour remplies ces 14 derniers jours — ce que la sécurité doit voir.
  // Filtré en base : les photos sont lourdes, inutile de toutes les charger à chaque visite.
  const limiteSejour = subDays(now, 2);
  const limiteSansSejour = subDays(now, 14);
  const piecesIdentite = await db
    .select({
      id: gendarmerieOccupants.id,
      nom: gendarmerieOccupants.nom,
      prenom: gendarmerieOccupants.prenom,
      nationalite: gendarmerieOccupants.nationalite,
      numeroPiece: gendarmerieOccupants.numeroPiece,
      photoPieceUrl: gendarmerieOccupants.photoPieceUrl,
      createdAt: gendarmerieOccupants.createdAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(gendarmerieOccupants)
    .innerJoin(gendarmerieForms, eq(gendarmerieOccupants.formId, gendarmerieForms.id))
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .where(
      toutesLesPieces
        ? isNotNull(gendarmerieOccupants.photoPieceUrl)
        : and(
            isNotNull(gendarmerieOccupants.photoPieceUrl),
            or(
              gte(reservations.checkOut, limiteSejour),
              and(isNull(gendarmerieForms.reservationId), gte(gendarmerieOccupants.createdAt, limiteSansSejour))
            )
          )
    )
    .orderBy(desc(gendarmerieOccupants.createdAt));

  const vus = new Set<string>();
  const piecesAffichees = piecesIdentite.filter((p) => {
    if (!domaineEstActif(p.domaineNom)) return false;
    // Même pièce enregistrée deux fois pour le même séjour (fiche de groupe + Bulletin
    // Individuel, ou formulaire renvoyé) : affichée une seule fois.
    const cle = `${(p.numeroPiece ?? p.id).toUpperCase().replace(/\s+/g, "")}|${p.villaNom ?? ""}|${format(p.checkIn ?? p.createdAt, "yyyy-MM-dd")}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });

  const piecesParDomaine = new Map<string, typeof piecesAffichees>();
  for (const p of piecesAffichees) {
    const key = p.domaineNom ?? "Sans domaine";
    if (!piecesParDomaine.has(key)) piecesParDomaine.set(key, []);
    piecesParDomaine.get(key)!.push(p);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Fiche police et conditions de séjour de chaque voyageur, en un seul lien
        </p>
      </div>

      <Tabs defaultValue={ongletActif}>
        <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="arrivees" className="shrink-0">
            <CalendarCheck className="h-4 w-4" />
            Arrivées
          </TabsTrigger>
          <TabsTrigger value="creer" className="shrink-0">
            <FilePlus2 className="h-4 w-4" />
            Créer un lien
          </TabsTrigger>
          <TabsTrigger value="historique" className="shrink-0">
            <History className="h-4 w-4" />
            Historique
          </TabsTrigger>
          <TabsTrigger value="pieces-identite" className="shrink-0">
            <IdCard className="h-4 w-4" />
            Pièces d&apos;identité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arrivees" className="space-y-4">
          <DocumentsArrivees now={now} />
        </TabsContent>

        <TabsContent value="creer" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Pas besoin pour les réservations Airbnb / Booking.com : leur lien part tout seul. À utiliser pour une réservation
            directe, ou un client qui n&apos;a pas reçu son lien.
          </p>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Conditions de séjour + fiche police
            </h2>
            <GenerateContratForm
              domaines={allDomaines}
              villas={allVillas}
              reservations={reservationsForContrat}
              defaultVillaId={villaIdPrerempli}
              defaultReservationId={reservationIdPrerempli}
              signatureAgenceEnregistree={signatureAgenceEnregistree}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fiche police seule</h2>
            <GenerateFichePoliceForm domaines={allDomaines} villas={allVillas} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sur place</h2>
            <PassportDropZone domaines={allDomaines} villas={allVillas} />
          </section>
        </TabsContent>

        <TabsContent value="historique" className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Conditions de séjour et contrats
            </h2>
            {contrats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun pour l&apos;instant.</p>
            ) : (
              contrats.map((c) => (
                <DocumentRow
                  key={c.id}
                  href={
                    c.statut === "signe"
                      ? `/contrats/${c.id}`
                      : dossierContratIds.has(c.id)
                        ? `/dossier/${c.id}`
                        : `/c/${c.id}`
                  }
                  title={
                    (c.villaNom ? `${c.villaNom} (n°${c.villaNumero})` : "Logement supprimé") +
                    (c.locataireNom ? ` · ${c.locataireNom}` : "")
                  }
                  subtitle={
                    (c.signedAt
                      ? `Signé le ${format(new Date(c.signedAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}`
                      : `Créé le ${format(new Date(c.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}`) +
                    (estContratV1(c.signedAt) ? " · ancien contrat" : "")
                  }
                  badgeLabel={c.statut === "signe" ? "Signé" : "En attente"}
                  badgeVariant={c.statut === "signe" ? "default" : "outline"}
                  deleteAction={deleteContrat.bind(null, c.id)}
                />
              ))
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fiches police remplies</h2>
            {fichesRemplies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune fiche remplie pour l&apos;instant.</p>
            ) : (
              fichesRemplies.map((f) => (
                <DocumentRow
                  key={f.id}
                  href={`/gendarmerie/${f.id}`}
                  title={
                    (f.villaNom ? `${f.villaNom} (n°${f.villaNumero})` : "Logement supprimé") +
                    (f.guestName ? ` · ${f.guestName}` : "")
                  }
                  subtitle={`Remplie le ${format(new Date(f.completedAt ?? f.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}`}
                  badgeLabel="Remplie"
                  badgeVariant="default"
                  deleteAction={deleteGendarmerieForm.bind(null, f.id)}
                />
              ))
            )}
          </section>
        </TabsContent>

        <TabsContent value="pieces-identite" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-muted-foreground">
              {toutesLesPieces
                ? "Toutes les pièces d'identité transmises via les fiches police."
                : "Voyageurs des séjours en cours et à venir — pour la sécurité aux entrées de domaine."}{" "}
              <Link
                href={toutesLesPieces ? "/documents?onglet=pieces-identite" : "/documents?onglet=pieces-identite&pieces=tout"}
                className="text-primary underline-offset-4 hover:underline"
              >
                {toutesLesPieces ? "Voir seulement les séjours en cours" : "Voir tout l'historique"}
              </Link>
            </p>
            <PrintButton />
          </div>

          {piecesAffichees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce d&apos;identité pour ces séjours.</p>
          ) : (
            Array.from(piecesParDomaine.entries()).map(([domaineNom, liste]) => (
              <div key={domaineNom} className="space-y-2 break-inside-avoid">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {domaineNom} · {liste.length}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {liste.map((p) => (
                    <Card key={p.id} className="break-inside-avoid overflow-hidden">
                      <a
                        href={p.photoPieceUrl!}
                        download={`piece-identite-${[p.prenom, p.nom].filter(Boolean).join("-") || p.id}.jpg`}
                        className="group relative block"
                      >
                        <Image
                          src={p.photoPieceUrl!}
                          alt="Pièce d'identité"
                          width={300}
                          height={200}
                          unoptimized
                          className="h-32 w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 text-transparent transition-colors group-hover:bg-black/50 group-hover:text-white print:hidden">
                          <Download className="h-4 w-4" />
                          <span className="text-xs font-medium">Télécharger</span>
                        </span>
                      </a>
                      <CardContent className="space-y-0.5 p-3">
                        <p className="break-words text-sm font-medium md:truncate">
                          {[p.prenom, p.nom].filter(Boolean).join(" ") || "Nom non renseigné"}
                        </p>
                        <p className="break-words text-xs text-muted-foreground md:truncate">
                          {p.villaNom ? `${p.villaNom} (n°${p.villaNumero})` : "Logement non renseigné"}
                        </p>
                        {p.checkIn && p.checkOut ? (
                          <p className="text-xs text-muted-foreground">
                            {format(p.checkIn, "d MMM", { locale: fr })} → {format(p.checkOut, "d MMM yyyy", { locale: fr })}
                          </p>
                        ) : null}
                        {p.numeroPiece ? (
                          <p className="break-words text-xs text-muted-foreground md:truncate">Pièce : {p.numeroPiece}</p>
                        ) : null}
                        {p.nationalite ? (
                          <p className="break-words text-xs text-muted-foreground md:truncate">{p.nationalite}</p>
                        ) : null}
                        {!p.checkIn ? (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(p.createdAt), "d MMM yyyy", { locale: fr })}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
