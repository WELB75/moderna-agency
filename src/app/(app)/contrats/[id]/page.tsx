import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { contratsLocation, villas } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { ContratDocument } from "@/components/app/contrat-document";

export default async function ContratDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [contrat] = await db
    .select({
      id: contratsLocation.id,
      statut: contratsLocation.statut,
      agenceRepresentant: contratsLocation.agenceRepresentant,
      locataireNom: contratsLocation.locataireNom,
      locataireAdresse: contratsLocation.locataireAdresse,
      nbAdultes: contratsLocation.nbAdultes,
      nbEnfants: contratsLocation.nbEnfants,
      dateArrivee: contratsLocation.dateArrivee,
      dateDepart: contratsLocation.dateDepart,
      devise: contratsLocation.devise,
      montantTotal: contratsLocation.montantTotal,
      acompteMontant: contratsLocation.acompteMontant,
      soldeMontant: contratsLocation.soldeMontant,
      soldeDateLimite: contratsLocation.soldeDateLimite,
      depotGarantieMontant: contratsLocation.depotGarantieMontant,
      depotRestitutionDate: contratsLocation.depotRestitutionDate,
      lieuSignature: contratsLocation.lieuSignature,
      dateSignatureAgence: contratsLocation.dateSignatureAgence,
      signatureAgenceNom: contratsLocation.signatureAgenceNom,
      signatureAgenceImage: contratsLocation.signatureAgenceImage,
      signatureClientNom: contratsLocation.signatureClientNom,
      signatureClientPiece: contratsLocation.signatureClientPiece,
      signatureClientImage: contratsLocation.signatureClientImage,
      signedAt: contratsLocation.signedAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaAdresse: villas.adresse,
    })
    .from(contratsLocation)
    .leftJoin(villas, eq(contratsLocation.villaId, villas.id))
    .where(eq(contratsLocation.id, id))
    .limit(1);

  if (!contrat) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <div>
            <p className="font-semibold">Contrat de location saisonnière</p>
            <p className="text-sm text-muted-foreground">
              {contrat.villaNom ? `${contrat.villaNom} (n°${contrat.villaNumero})` : "Logement non renseigné"}
              {contrat.locataireNom ? ` · ${contrat.locataireNom}` : ""}
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {contrat.statut !== "signe" ? (
        <p className="text-sm text-muted-foreground">Ce contrat n&apos;a pas encore été signé par le client.</p>
      ) : (
        <div className="space-y-4">
          <Card className="hidden print:block print:border-none">
            <CardContent className="flex items-center justify-center pb-2 pt-4 print:justify-start">
              <Logo size={56} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <ContratDocument contrat={contrat} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 break-inside-avoid sm:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-semibold">Signature de l&apos;Agence</p>
                <p className="text-sm text-muted-foreground">{contrat.signatureAgenceNom || "—"}</p>
                {contrat.signatureAgenceImage ? (
                  <div className="w-fit rounded-md border bg-white p-2">
                    <Image
                      src={contrat.signatureAgenceImage}
                      alt="Signature de l'Agence"
                      width={300}
                      height={120}
                      unoptimized
                      className="h-auto w-48"
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-semibold">Signature du Locataire</p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Nom : </span>
                  {contrat.signatureClientNom || "—"}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Pièce d&apos;identité : </span>
                  {contrat.signatureClientPiece || "—"}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Signé le : </span>
                  {contrat.signedAt ? format(new Date(contrat.signedAt), "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—"}
                </p>
                {contrat.signatureClientImage ? (
                  <div className="w-fit rounded-md border bg-white p-2">
                    <Image
                      src={contrat.signatureClientImage}
                      alt="Signature du client"
                      width={300}
                      height={120}
                      unoptimized
                      className="h-auto w-48"
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
