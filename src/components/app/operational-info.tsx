"use client";

import { useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { updateOperationalInfo } from "@/lib/actions/reservations";

export function OperationalSummary({
  assigneCheckin,
  formulaireBienvenueEnvoye,
  formulaireCheckinRecu,
  aRelancer,
}: {
  assigneCheckin: string | null;
  formulaireBienvenueEnvoye: boolean;
  formulaireCheckinRecu: boolean;
  aRelancer: boolean;
}) {
  const hasAnything = assigneCheckin || formulaireBienvenueEnvoye || formulaireCheckinRecu || aRelancer;
  if (!hasAnything) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      {assigneCheckin ? <Badge variant="outline">Check-in : {assigneCheckin}</Badge> : null}
      {formulaireBienvenueEnvoye ? <Badge variant="outline">Bienvenue envoyé</Badge> : null}
      {formulaireCheckinRecu ? <Badge variant="outline">Formulaire check-in reçu</Badge> : null}
      {aRelancer ? <Badge variant="destructive">À relancer</Badge> : null}
    </div>
  );
}

export function EditOperationalInfoDialog({
  reservationId,
  assigneCheckin,
  formulaireBienvenueEnvoye,
  formulaireCheckinRecu,
  aRelancer,
}: {
  reservationId: string;
  assigneCheckin: string | null;
  formulaireBienvenueEnvoye: boolean;
  formulaireCheckinRecu: boolean;
  aRelancer: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [bienvenue, setBienvenue] = useState(formulaireBienvenueEnvoye);
  const [checkinRecu, setCheckinRecu] = useState(formulaireCheckinRecu);
  const [relancer, setRelancer] = useState(aRelancer);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    formData.set("reservationId", reservationId);
    if (bienvenue) formData.set("formulaireBienvenueEnvoye", "on");
    if (checkinRecu) formData.set("formulaireCheckinRecu", "on");
    if (relancer) formData.set("aRelancer", "on");
    startTransition(async () => {
      try {
        await updateOperationalInfo(formData);
        toast.success("Suivi mis à jour.");
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
          <ClipboardList className="h-4 w-4" />
          Suivi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suivi opérationnel</DialogTitle>
          <DialogDescription>
            Ce que Superhote affiche mais ne partage pas avec nous (pas d&apos;API disponible) : à
            renseigner ici à la main. Le ménage et la cuisine s&apos;affectent juste en dessous, sur la fiche.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assigneCheckin">Assigné check-in</Label>
            <Input id="assigneCheckin" name="assigneCheckin" defaultValue={assigneCheckin ?? ""} placeholder="Ex. Kamel" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="bienvenue" checked={bienvenue} onCheckedChange={(v) => setBienvenue(v === true)} />
              <Label htmlFor="bienvenue" className="font-normal">Formulaire de bienvenue envoyé</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="checkinRecu" checked={checkinRecu} onCheckedChange={(v) => setCheckinRecu(v === true)} />
              <Label htmlFor="checkinRecu" className="font-normal">Formulaire de check-in reçu</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="relancer" checked={relancer} onCheckedChange={(v) => setRelancer(v === true)} />
              <Label htmlFor="relancer" className="font-normal">À relancer</Label>
            </div>
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
