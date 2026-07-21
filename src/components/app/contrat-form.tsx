"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { ContratDocument, type ContratDocumentData } from "@/components/app/contrat-document";
import { submitContratSignature } from "@/lib/actions/contrats";

export function ContratForm({ contrat }: { contrat: ContratDocumentData & { id: string; signatureAgenceImage: string | null } }) {
  const [nom, setNom] = useState(contrat.locataireNom ?? "");
  const [piece, setPiece] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignaturePadHandle>(null);

  if (submitted) {
    return (
      <div className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-lg font-medium">Merci, le contrat a bien été signé.</p>
      </div>
    );
  }

  function handleSubmit() {
    if (!nom.trim()) {
      toast.error("Indique ton nom complet.");
      return;
    }
    if (sigRef.current?.isEmpty()) {
      toast.error("La signature est obligatoire.");
      return;
    }
    const signatureImage = sigRef.current!.toDataUrl();
    startTransition(async () => {
      try {
        await submitContratSignature(contrat.id, { clientNom: nom, clientPiece: piece, signatureImage });
        setSubmitted(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <Card>
        <CardContent className="py-4">
          <ContratDocument contrat={contrat} />
        </CardContent>
      </Card>

      {contrat.signatureAgenceImage ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-semibold">Signature de l&apos;Agence</p>
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
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 py-4">
          <p className="text-sm font-semibold">Signature du Locataire</p>
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Numéro de pièce d&apos;identité (CIN / passeport)</Label>
            <Input value={piece} onChange={(e) => setPiece(e.target.value)} />
          </div>
          <SignaturePad ref={sigRef} label="Signature (avec le doigt ou la souris)" clearLabel="Effacer" />
        </CardContent>
      </Card>

      <Button type="button" disabled={isPending} onClick={handleSubmit} className="w-full">
        {isPending ? "Envoi..." : "Signer et envoyer"}
      </Button>
    </div>
  );
}
