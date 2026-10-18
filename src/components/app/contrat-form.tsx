"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { ConditionsSejourDocument } from "@/components/app/contrat-document";
import { submitContratSignature } from "@/lib/actions/contrats";
import type { ConditionsSejourData } from "@/lib/conditions-sejour";

// Signature des Conditions de séjour par le client (liens /c/[id] et /dossier/[id], générés depuis
// Documents) — même texte que celui accepté en fin de fiche police.
export function ContratForm({
  contratId,
  conditions,
  signatureAgenceImage,
}: {
  contratId: string;
  conditions: ConditionsSejourData;
  signatureAgenceImage: string | null;
}) {
  const [nom, setNom] = useState(conditions.locataireNom ?? "");
  const [piece, setPiece] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignaturePadHandle>(null);

  if (submitted) {
    return (
      <div className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-lg font-medium">Merci, les conditions de séjour ont bien été signées.</p>
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
        await submitContratSignature(contratId, { clientNom: nom, clientPiece: piece, signatureImage });
        setSubmitted(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Card>
        <CardContent className="px-3 py-4 sm:px-4">
          <ConditionsSejourDocument data={conditions} />
        </CardContent>
      </Card>

      {signatureAgenceImage ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-semibold">Signature de l&apos;Agence</p>
            <div className="w-fit rounded-md border bg-white p-2">
              <Image
                src={signatureAgenceImage}
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
            <Input className="h-11 md:h-8" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Numéro de pièce d&apos;identité (CIN / passeport)</Label>
            <Input className="h-11 md:h-8" value={piece} onChange={(e) => setPiece(e.target.value)} />
          </div>
          <SignaturePad ref={sigRef} label="Signature (avec le doigt ou la souris)" clearLabel="Effacer" />
        </CardContent>
      </Card>

      <Button type="button" disabled={isPending} onClick={handleSubmit} className="h-12 w-full text-base md:h-8 md:text-sm">
        {isPending ? "Envoi..." : "Signer et envoyer"}
      </Button>
    </div>
  );
}
