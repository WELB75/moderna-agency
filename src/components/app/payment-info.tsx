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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updatePaymentInfo, markSoldeRecu, markCautionRecue } from "@/lib/actions/reservations";

export function PaymentSummary({
  reservationId,
  loyerTotal,
  montantPaye,
  caution,
  cautionPayee,
  devisePaiement,
}: {
  reservationId?: string;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  devisePaiement: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (loyerTotal === null) {
    return null;
  }

  const total = Number(loyerTotal);
  const paye = Number(montantPaye ?? 0);
  const solde = total - paye;
  const d = devisePaiement;

  function handleSoldeRecu(moyen: "especes" | "virement") {
    if (!reservationId) return;
    startTransition(async () => {
      try {
        await markSoldeRecu(reservationId, moyen);
        toast.success("Solde marqué payé.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  function handleCautionRecue() {
    if (!reservationId) return;
    startTransition(async () => {
      try {
        await markCautionRecue(reservationId);
        toast.success("Caution marquée reçue.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Loyer : {paye.toFixed(2)} {d} / {total.toFixed(2)} {d}
        </span>
        {solde > 0.009 ? (
          <>
            <Badge variant="destructive">Reste {solde.toFixed(2)} {d} à payer</Badge>
            {reservationId && (
              <>
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleSoldeRecu("especes")}>
                  Reçu en espèces
                </Button>
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleSoldeRecu("virement")}>
                  Reçu par virement
                </Button>
              </>
            )}
          </>
        ) : (
          <Badge variant="outline">Loyer soldé</Badge>
        )}
      </div>
      {caution !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Caution : {Number(caution).toFixed(2)} {d}</span>
          {cautionPayee ? (
            <Badge variant="outline">Caution reçue</Badge>
          ) : (
            <>
              <Badge variant="destructive">Caution à recevoir</Badge>
              {reservationId && (
                <Button variant="outline" size="sm" disabled={isPending} onClick={handleCautionRecue}>
                  Marquer reçue
                </Button>
              )}
            </>
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
  devisePaiement,
  moyenPaiement,
  notesPaiement,
}: {
  reservationId: string;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  devisePaiement: string;
  moyenPaiement: string | null;
  notesPaiement: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [cautionPayeeState, setCautionPayeeState] = useState(cautionPayee);
  const [devise, setDevise] = useState(devisePaiement || "EUR");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("reservationId", reservationId);
    formData.set("devisePaiement", devise);
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
            Loyer convenu, montant reçu et caution pour cette réservation, dans la devise réellement payée par le client.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Devise du paiement</Label>
            <Select value={devise} onValueChange={setDevise}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">Euros (EUR)</SelectItem>
                <SelectItem value="DH">Dirhams (DH)</SelectItem>
                <SelectItem value="USD">Dollars (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loyerTotal">Loyer total ({devise})</Label>
              <Input
                id="loyerTotal"
                name="loyerTotal"
                type="number"
                step="0.01"
                defaultValue={loyerTotal ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="montantPaye">Montant reçu ({devise})</Label>
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
            <Label htmlFor="caution">Caution ({devise})</Label>
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
