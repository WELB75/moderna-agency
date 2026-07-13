"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { dataUrlToFile } from "@/lib/data-url-to-file";
import { finalizeChecklist } from "@/lib/actions/inventaire";

export function FinalizeChecklist({
  checklistId,
  agentNom,
  defaultClientNom,
}: {
  checklistId: string;
  agentNom: string | null;
  defaultClientNom: string;
}) {
  const [open, setOpen] = useState(false);
  const [clientNom, setClientNom] = useState(defaultClientNom);
  const [isPending, startTransition] = useTransition();
  const clientSigRef = useRef<SignaturePadHandle>(null);
  const agentSigRef = useRef<SignaturePadHandle>(null);
  const router = useRouter();

  function handleSubmit() {
    if (!clientNom.trim()) {
      toast.error("Le nom du client est obligatoire.");
      return;
    }
    if (clientSigRef.current?.isEmpty() || agentSigRef.current?.isEmpty()) {
      toast.error("Les deux signatures sont obligatoires.");
      return;
    }

    startTransition(async () => {
      try {
        const clientFile = await dataUrlToFile(clientSigRef.current!.toDataUrl(), `signature-client-${checklistId}.png`);
        const agentFile = await dataUrlToFile(agentSigRef.current!.toDataUrl(), `signature-agent-${checklistId}.png`);

        const [clientBlob, agentBlob] = await Promise.all([
          upload(`inventaire/${checklistId}/signature-client.png`, clientFile, {
            access: "public",
            handleUploadUrl: "/api/blob/upload",
          }),
          upload(`inventaire/${checklistId}/signature-agent.png`, agentFile, {
            access: "public",
            handleUploadUrl: "/api/blob/upload",
          }),
        ]);

        await finalizeChecklist({
          checklistId,
          clientNom,
          clientSignatureUrl: clientBlob.url,
          agentSignatureUrl: agentBlob.url,
        });

        toast.success("État des lieux signé et enregistré.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la signature.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full">
          <PenLine className="h-4 w-4" />
          Valider et faire signer le client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signature de l&apos;état des lieux</DialogTitle>
          <DialogDescription>
            Le client confirme l&apos;état des équipements en signant ci-dessous.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientNom">Nom du client</Label>
            <Input id="clientNom" value={clientNom} onChange={(e) => setClientNom(e.target.value)} required />
          </div>
          <SignaturePad ref={clientSigRef} label="Signature du client" />
          <SignaturePad ref={agentSigRef} label={`Signature de l'agent${agentNom ? ` (${agentNom})` : ""}`} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Enregistrement..." : "Confirmer la signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
