import Image from "next/image";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SecuriteShell } from "@/components/app/securite-shell";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { DeclarationSyndicDocument } from "@/components/app/declaration-syndic-document";
import { ConditionsSejourDocument, ContratDocumentV1 } from "@/components/app/contrat-document";
import { PrintButton } from "@/components/app/print-button";
import { getReservationSecurityData } from "@/lib/security-data";
import { getContratIdDuSejour, getDeclarationSyndic } from "@/lib/syndic";
import { chargerContrat } from "@/lib/contrat-donnees";
import { estContratV1 } from "@/lib/contrat-template";

// Lien envoyé par WhatsApp au syndic / gardien de la résidence (appartements Noria) : tout le
// dossier du séjour au même endroit — déclaration sur l'honneur, contrat signé, photos des pièces
// d'identité. Public comme /securite/villa/[reservationId] : l'identifiant aléatoire de la
// réservation fait office de clé, et il est propre à ce séjour.
export default async function SyndicDossierPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const [declaration, securite, contratId] = await Promise.all([
    getDeclarationSyndic(reservationId),
    getReservationSecurityData(reservationId),
    getContratIdDuSejour(reservationId),
  ]);
  if (!declaration) notFound();
  const contrat = contratId ? await chargerContrat(contratId) : null;
  const contratSigne = contrat?.statut === "signe" ? contrat : null;

  return (
    <SecuriteShell
      eyebrow="Dossier du séjour — résidence"
      subtitle="Déclaration sur l'honneur, contrat signé et pièces d'identité de ce séjour uniquement."
    >
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground print:hidden">Déclaration sur l&apos;honneur</h2>
        <DeclarationSyndicDocument d={declaration} />
      </section>

      <section className="space-y-3 print:break-before-page">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground print:hidden">Contrat signé</h2>
        {contratSigne ? (
          <div className="space-y-4 rounded-xl border bg-white p-5 text-black">
            {estContratV1(contratSigne.signedAt) ? (
              <ContratDocumentV1 contrat={contratSigne} />
            ) : (
              <ConditionsSejourDocument data={contratSigne.conditions} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { titre: "Signature de l'Agence", nom: contratSigne.signatureAgenceNom, image: contratSigne.signatureAgenceImage },
                {
                  titre: "Signature du Locataire",
                  nom: [contratSigne.signatureClientNom, contratSigne.signatureClientPiece].filter(Boolean).join(" · "),
                  image: contratSigne.signatureClientImage,
                },
              ].map((sig) => (
                <div key={sig.titre} className="space-y-1.5 break-inside-avoid">
                  <p className="text-sm font-semibold">{sig.titre}</p>
                  <p className="text-sm text-neutral-600">{sig.nom || "—"}</p>
                  {sig.image ? <Image src={sig.image} alt={sig.titre} width={300} height={120} unoptimized className="h-auto w-48 rounded-md border bg-white p-2" /> : null}
                </div>
              ))}
            </div>
            {contratSigne.signedAt ? (
              <p className="text-xs text-neutral-500">
                Signé le {format(new Date(contratSigne.signedAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">Le contrat de ce séjour n&apos;est pas encore signé par le client.</p>
        )}
      </section>

      <section className="space-y-3 print:break-before-page">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground print:hidden">Pièces d&apos;identité</h2>
        {securite ? (
          <VillaSecurityBlock data={securite} />
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">Aucune fiche police remplie pour ce séjour.</p>
        )}
      </section>
    </SecuriteShell>
  );
}
