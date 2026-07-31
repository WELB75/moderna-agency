import Image from "next/image";
import { desc, eq, asc, isNotNull, ne, and, gte } from "drizzle-orm";
import { format } from "date-fns";
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
import { deleteGendarmerieForm } from "@/lib/actions/gendarmerie";
import { deleteContrat } from "@/lib/actions/contrats";
import { filtrerDomainesActifs, domaineEstActif, idsDomainesActifs } from "@/lib/domaines-actifs";
import { FileText, FileSignature, IdCard, Download } from "lucide-react";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function DocumentsPage() {
  const db = getDb();

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
  ).filter((v) => v.domaineId && domaineIdsActifs.has(v.domaineId));

  const fichesPolice = await db
    .select({
      id: gendarmerieForms.id,
      statut: gendarmerieForms.statut,
      createdAt: gendarmerieForms.createdAt,
      completedAt: gendarmerieForms.completedAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaType: villas.type,
      domaineNom: domaines.nom,
      guestName: reservations.guestName,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .orderBy(desc(gendarmerieForms.createdAt))
    .limit(50);

  // Phase de test : on ne travaille que sur le Domaine Moderna II (Zaraba et Noria mis de côté).
  const fichesVisibles = fichesPolice.filter((f) => domaineEstActif(f.domaineNom));
  const fichesKamel = fichesVisibles.filter((f) => f.domaineNom === "Domaine Moderna II");
  const fichesAutres = fichesVisibles.filter((f) => f.domaineNom !== "Domaine Moderna II");

  const villaIdsActifs = new Set(allVillas.map((v) => v.id));

  // Pour pré-remplir le contrat de location depuis une réservation Superhote existante
  // (nom, dates, effectif, et le loyer/caution quand ils ont été renseignés) plutôt que de
  // tout retaper à la main.
  // Trié par ordre d'arrivée (la prochaine en premier) plutôt que par date de création — pour
  // que les séjours déjà passés depuis longtemps ne noient pas ceux qui arrivent bientôt.
  const nowForContrats = nowInMorocco();
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
      })
      .from(reservations)
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, nowForContrats)))
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => r.villaId && villaIdsActifs.has(r.villaId));

  const contrats = (
    await db
      .select({
        id: contratsLocation.id,
        statut: contratsLocation.statut,
        locataireNom: contratsLocation.locataireNom,
        createdAt: contratsLocation.createdAt,
        villaId: contratsLocation.villaId,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(contratsLocation)
      .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
      .orderBy(desc(contratsLocation.createdAt))
      .limit(50)
  ).filter((c) => !c.villaId || villaIdsActifs.has(c.villaId));

  const dossierContratIds = new Set(
    (await db.select({ contratId: gendarmerieForms.contratId }).from(gendarmerieForms))
      .map((f) => f.contratId)
      .filter((id): id is string => Boolean(id))
  );

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
    })
    .from(gendarmerieOccupants)
    .innerJoin(gendarmerieForms, eq(gendarmerieOccupants.formId, gendarmerieForms.id))
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(isNotNull(gendarmerieOccupants.photoPieceUrl))
    .orderBy(desc(gendarmerieOccupants.createdAt));

  const piecesParDomaine = new Map<string, typeof piecesIdentite>();
  for (const p of piecesIdentite.filter((p) => domaineEstActif(p.domaineNom))) {
    const key = p.domaineNom ?? "Sans domaine";
    if (!piecesParDomaine.has(key)) piecesParDomaine.set(key, []);
    piecesParDomaine.get(key)!.push(p);
  }

  function ficheStats(list: typeof fichesPolice) {
    const remplies = list.filter((f) => f.statut === "complete").length;
    const taux = list.length > 0 ? Math.round((remplies / list.length) * 100) : 0;
    return { total: list.length, remplies, enAttente: list.length - remplies, taux };
  }
  const statsKamel = ficheStats(fichesKamel);

  const contratsSignes = contrats.filter((c) => c.statut === "signe").length;
  const contratsTauxSignature =
    contrats.length > 0 ? Math.round((contratsSignes / contrats.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Fiche de police et contrat de location saisonnière
        </p>
      </div>

      <Tabs defaultValue="fiche-police">
        <TabsList>
          <TabsTrigger value="fiche-police">
            <FileText className="h-4 w-4" />
            Fiche police
          </TabsTrigger>
          <TabsTrigger value="contrat">
            <FileSignature className="h-4 w-4" />
            Contrat de location
          </TabsTrigger>
          <TabsTrigger value="pieces-identite">
            <IdCard className="h-4 w-4" />
            Pièces d&apos;identité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fiche-police" className="space-y-6">
          <PassportDropZone domaines={allDomaines} villas={allVillas} />
          <GenerateFichePoliceForm domaines={allDomaines} villas={allVillas} />

          {[
            { label: "Moderna II", stats: statsKamel, list: fichesKamel },
            ...(fichesAutres.length > 0 ? [{ label: "Autres", stats: ficheStats(fichesAutres), list: fichesAutres }] : []),
          ].map(({ label, stats, list }) => (
            <div key={label} className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Fiches générées" value={stats.total} />
                <StatCard label="Remplies" value={stats.remplies} />
                <StatCard label="En attente" value={stats.enAttente} />
                <StatCard label="Taux de complétion" value={`${stats.taux}%`} />
              </div>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune fiche pour l&apos;instant.</p>
                ) : (
                  list.map((f) => (
                    <DocumentRow
                      key={f.id}
                      href={f.statut === "complete" ? `/gendarmerie/${f.id}` : `/g/${f.id}`}
                      title={
                        (f.villaNom ? `${f.villaNom} (n°${f.villaNumero})` : "Logement supprimé") +
                        (f.guestName ? ` · ${f.guestName}` : "")
                      }
                      subtitle={format(new Date(f.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                      badgeLabel={f.statut === "complete" ? "Rempli" : "En attente"}
                      badgeVariant={f.statut === "complete" ? "default" : "outline"}
                      deleteAction={deleteGendarmerieForm.bind(null, f.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="contrat" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Contrats générés" value={contrats.length} />
            <StatCard label="Signés" value={contratsSignes} />
            <StatCard label="En attente" value={contrats.length - contratsSignes} />
            <StatCard label="Taux de signature" value={`${contratsTauxSignature}%`} />
          </div>

          <GenerateContratForm domaines={allDomaines} villas={allVillas} reservations={reservationsForContrat} />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contrats générés
            </p>
            {contrats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun contrat pour l&apos;instant.</p>
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
                  subtitle={format(new Date(c.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  badgeLabel={c.statut === "signe" ? "Signé" : "En attente"}
                  badgeVariant={c.statut === "signe" ? "default" : "outline"}
                  deleteAction={deleteContrat.bind(null, c.id)}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="pieces-identite" className="space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <p className="text-sm text-muted-foreground">
              Photos des pièces d&apos;identité transmises via les fiches police — pour la sécurité aux
              entrées de domaine.
            </p>
            <PrintButton />
          </div>

          {piecesIdentite.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce d&apos;identité pour l&apos;instant.</p>
          ) : (
            Array.from(piecesParDomaine.entries()).map(([domaineNom, pieces]) => (
              <div key={domaineNom} className="space-y-2 break-inside-avoid">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {domaineNom}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {pieces.map((p) => (
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
                        <p className="truncate text-sm font-medium">
                          {[p.prenom, p.nom].filter(Boolean).join(" ") || "Nom non renseigné"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.villaNom ? `${p.villaNom} (n°${p.villaNumero})` : "Logement non renseigné"}
                        </p>
                        {p.numeroPiece ? (
                          <p className="truncate text-xs text-muted-foreground">Pièce : {p.numeroPiece}</p>
                        ) : null}
                        {p.nationalite ? (
                          <p className="truncate text-xs text-muted-foreground">{p.nationalite}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(p.createdAt), "d MMM yyyy", { locale: fr })}
                        </p>
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
