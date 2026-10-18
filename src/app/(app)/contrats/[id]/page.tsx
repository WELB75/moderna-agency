import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { ConditionsSejourDocument, ContratDocumentV1 } from "@/components/app/contrat-document";
import { chargerContrat } from "@/lib/contrat-donnees";
import { estContratV1 } from "@/lib/contrat-template";

export default async function ContratDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contrat = await chargerContrat(id);
  if (!contrat) notFound();

  // Contrat signé avec l'ancien texte : réaffiché tel quel (c'est ce que le client a signé).
  const ancienTexte = estContratV1(contrat.signedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={40} />
          <div>
            <p className="font-semibold">{ancienTexte ? "Contrat de location saisonnière" : "Conditions de séjour"}</p>
            <p className="text-sm text-muted-foreground">
              {contrat.villaNom ? `${contrat.villaNom} (n°${contrat.villaNumero})` : "Logement non renseigné"}
              {contrat.locataireNom ? ` · ${contrat.locataireNom}` : ""}
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {contrat.statut !== "signe" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Pas encore signé par le client — aperçu du texte qu&apos;il verra :</p>
          <Card>
            <CardContent className="py-4">
              <ConditionsSejourDocument data={contrat.conditions} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="hidden print:block print:border-none">
            <CardContent className="flex items-center justify-center pb-2 pt-4 print:justify-start">
              <Logo size={56} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              {ancienTexte ? <ContratDocumentV1 contrat={contrat} /> : <ConditionsSejourDocument data={contrat.conditions} />}
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
