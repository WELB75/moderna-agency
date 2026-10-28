"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, Undo2 } from "lucide-react";
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
import { annulerProlongation, infosProlongation, prolongerSejour, type ProlongationListee } from "@/lib/actions/prolongation";

function jourSuivant(d: Date): string {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return n.toISOString().slice(0, 10);
}

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function nbNuits(debut: Date, finISO: string): number {
  const d0 = Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate());
  return Math.max(0, Math.round((Date.parse(`${finISO}T00:00:00Z`) - d0) / 86_400_000));
}

export function ProlongerSejourDialog({ reservationId, checkOut, onDone }: { reservationId: string; checkOut: Date; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const minDepart = jourSuivant(checkOut);
  const [depart, setDepart] = useState(minDepart);
  const [heure, setHeure] = useState("");
  const [prixNuit, setPrixNuit] = useState("");
  const [devise, setDevise] = useState("EUR");
  const [montantRecu, setMontantRecu] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"extension" | "direct" | null>(null);
  const [prolongations, setProlongations] = useState<ProlongationListee[]>([]);
  const [isPending, startTransition] = useTransition();

  // Mode (séparée ou en place), devise et prolongations déjà faites : lus à l'ouverture.
  useEffect(() => {
    if (!open) return;
    let annule = false;
    infosProlongation(reservationId)
      .then((infos) => {
        if (annule) return;
        setMode(infos.mode);
        setDevise(infos.devise);
        setHeure((h) => h || infos.heureDepart);
        setProlongations(infos.prolongations);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [open, reservationId]);

  const nuits = nbNuits(checkOut, depart);
  const prix = Number(prixNuit.replace(",", "."));
  const total = prix > 0 && nuits > 0 ? Math.round(prix * nuits * 100) / 100 : null;

  function recharger() {
    infosProlongation(reservationId)
      .then((infos) => setProlongations(infos.prolongations))
      .catch(() => {});
  }

  function annuler(id: string, depuisToast = false) {
    startTransition(async () => {
      try {
        const res = await annulerProlongation(reservationId, id);
        toast.success(`Prolongation annulée. ${res.beds24Detail}`);
        if (!depuisToast) recharger();
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Annulation impossible.");
      }
    });
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await prolongerSejour(reservationId, {
          nouveauDepart: depart,
          heureDepart: heure || undefined,
          prixNuit: prix > 0 ? prix : null,
          devise,
          montantRecu: montantRecu || null,
          note,
        });
        const message =
          res.beds24Statut === "echec"
            ? `Séjour prolongé, mais le calendrier n'a PAS pu être bloqué : ${res.beds24Detail}`
            : res.beds24Statut === "ok"
              ? "Séjour prolongé, calendrier bloqué sur Airbnb et Booking.com."
              : `Séjour prolongé. ${res.beds24Detail}`;
        // Retour arrière à portée de main pendant quelques secondes, en cas de validation par erreur.
        toast(message, {
          duration: 20000,
          action: { label: "Annuler", onClick: () => annuler(res.id, true) },
        });
        if (res.menageAChecker) {
          toast.message("Le ménage prévu au départ initial est à retirer, un nouveau ménage est demandé pour le nouveau départ.");
        }
        setOpen(false);
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarPlus className="h-3 w-3" />
          Prolonger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prolonger le séjour</DialogTitle>
          <DialogDescription>
            {mode === "extension"
              ? "Client venu d'Airbnb ou Booking.com : la prolongation est enregistrée comme une réservation en direct séparée, la réservation de la plateforme n'est pas modifiée. "
              : "Le départ de la réservation est repoussé. "}
            Les nuits ajoutées sont vérifiées libres puis fermées dans le calendrier (Airbnb et Booking.com). Tu pourras revenir en arrière.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nouveau jour de départ</Label>
            <Input type="date" min={minDepart} value={depart} onChange={(e) => setDepart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Heure de départ</Label>
            <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Prix par nuit</Label>
            <Input inputMode="decimal" placeholder="Optionnel" value={prixNuit} onChange={(e) => setPrixNuit(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Devise</Label>
            <select
              value={devise}
              onChange={(e) => setDevise(e.target.value)}
              disabled={mode === "direct"}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60"
            >
              <option value="EUR">EUR</option>
              <option value="MAD">MAD</option>
              {devise !== "EUR" && devise !== "MAD" ? <option value={devise}>{devise}</option> : null}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Déjà reçu</Label>
            <Input inputMode="decimal" placeholder="Optionnel" value={montantRecu} onChange={(e) => setMontantRecu(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input placeholder="Optionnel" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {nuits > 0 ? `${nuits} nuit${nuits > 1 ? "s" : ""} ajoutée${nuits > 1 ? "s" : ""}` : "Choisis un départ après le départ actuel"}
          {total ? ` · total ${total} ${devise}` : ""}
        </p>

        {prolongations.length > 0 ? (
          <div className="space-y-1.5 rounded-md border p-2">
            <p className="text-xs font-medium">Prolongations déjà faites</p>
            {prolongations.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {jjmm(p.ancienDepart)} → {jjmm(p.nouveauDepart)}
                  {p.total ? ` · ${p.total} ${p.devise}` : ""}
                  {p.mode === "extension" ? " · en direct" : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  disabled={isPending}
                  onClick={() => {
                    if (window.confirm("Annuler cette prolongation ? Les nuits seront rouvertes dans le calendrier.")) annuler(p.id);
                  }}
                >
                  <Undo2 className="h-3 w-3" />
                  Annuler
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" disabled={isPending || nuits < 1} onClick={handleSave} className="w-full sm:w-auto">
            {isPending ? "Vérification..." : "Prolonger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
