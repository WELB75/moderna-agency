"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updatePaymentInfo } from "@/lib/actions/reservations";

export function PaymentSummary({
  loyerTotal,
  montantPaye,
  caution,
  cautionPayee,
}: {
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
}) {
  if (loyerTotal === null) return null;

  const total = Number(loyerTotal);
  const paye = Number(montantPaye ?? 0);
  const solde = total - paye;

  return (
    <div className="mt-2 space-y-1.5 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Loyer : {paye.toFixed(2)} DH / {total.toFixed(2)} DH
        </span>
        {solde > 0.009 ? (
          <Badge variant="destructive">Reste {solde.toFixed(2)} DH à payer</Badge>
        ) : (
          <Badge variant="outline">Loyer soldé</Badge>
        )}
      </div>
      {caution !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Caution : {Number(caution).toFixed(2)} DH</span>
          {cautionPayee ? (
            <Badge variant="outline">Caution reçue</Badge>
          ) : (
            <Badge variant="destructive">Caution à recevoir</Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function EditPaymentDialog({
  reservationId,
  loyerTotal,
  montantPaye,
  caution,
  cautionPayee,
  moyenPaiement,
  notesPaiement,
}: {
  reservationId: string;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  moyenPaiement: string | null;
  notesPaiement: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [cautionPayeeState, setCautionPayeeState] = useState(cautionPayee);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("reservationId", reservationId);
    startTransition(async () => {
      try {
        await updatePaymentInfo(formData);
        toast.success("Paiement mis à jour.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Wallet className="h-4 w-4" />
          Paiement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paiement de la réservation</DialogTitle>
          <DialogDescription>
            Loyer convenu, montant reçu et caution pour cette réservation.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loyerTotal">Loyer total (DH)</Label>
              <Input
                id="loyerTotal"
                name="loyerTotal"
                type="number"
                step="0.01"
                defaultValue={loyerTotal ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="montantPaye">Montant reçu (DH)</Label>
              <Input
                id="montantPaye"
                name="montantPaye"
                type="number"
                step="0.01"
                defaultValue={montantPaye ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caution">Caution (DH)</Label>
            <Input
              id="caution"
              name="caution"
              type="number"
              step="0.01"
              defaultValue={caution ?? ""}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cautionPayeeCheckbox"
              checked={cautionPayeeState}
              onCheckedChange={(value) => setCautionPayeeState(value === true)}
            />
            <Label htmlFor="cautionPayeeCheckbox">Caution reçue</Label>
            <input type="hidden" name="cautionPayee" value={cautionPayeeState ? "on" : ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="moyenPaiement">Moyen de paiement</Label>
            <Input
              id="moyenPaiement"
              name="moyenPaiement"
              placeholder="Ex. Virement instantané"
              defaultValue={moyenPaiement ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notesPaiement">Notes</Label>
            <Textarea id="notesPaiement" name="notesPaiement" rows={2} defaultValue={notesPaiement ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
