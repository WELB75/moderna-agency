"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addPlanningAffectation } from "@/lib/actions/planning-public";

export type ReservationOption = {
  id: string;
  villaNom: string | null;
  villaNumero: string | null;
  guestName: string;
};
type PersonnelOption = { id: string; nom: string };

// Bouton + formulaire "Ajouter" sur le lien public de planning — Kamel, 2026-08-08 : "aussi la
// possibilité de les ajouter [...] on met le nom, on met le lieu [...] et si c'est ménage de
// départ si c'est pendant le séjour si c'est petit déjeuner déjeuner etc. toutes les infos". Ne
// propose que les réservations de la semaine affichée (passées depuis la page) — pas besoin de
// charger tout l'historique dans un simple menu déroulant.
export function AddPlanningEntryDialog({
  token,
  reservations,
  menageOptions,
  cuisineOptions,
}: {
  token: string;
  reservations: ReservationOption[];
  menageOptions: PersonnelOption[];
  cuisineOptions: PersonnelOption[];
}) {
  const [open, setOpen] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [role, setRole] = useState<"menage" | "cuisine">("menage");
  const [moment, setMoment] = useState<"depart" | "sejour">("depart");
  const [avecDejeuner, setAvecDejeuner] = useState(false);
  const [personnelId, setPersonnelId] = useState("");
  const [isPending, startTransition] = useTransition();

  const options = role === "menage" ? menageOptions : cuisineOptions;

  function reset() {
    setReservationId("");
    setRole("menage");
    setMoment("depart");
    setAvecDejeuner(false);
    setPersonnelId("");
  }

  function handleSubmit() {
    if (!reservationId || !personnelId) {
      toast.error("Choisis la villa/client et la personne.");
      return;
    }
    startTransition(async () => {
      try {
        await addPlanningAffectation(token, reservationId, personnelId, role === "menage" ? moment : "unique", avecDejeuner);
        toast.success("Ajouté au planning.");
        setOpen(false);
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter au planning</DialogTitle>
          <DialogDescription>Villa/client, type de mission et personne.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Villa / client</Label>
            <Select value={reservationId} onValueChange={setReservationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {reservations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"} — {r.guestName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as "menage" | "cuisine");
                setPersonnelId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menage">Femme de ménage</SelectItem>
                <SelectItem value="cuisine">Cuisinière</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "menage" ? (
            <div className="space-y-1.5">
              <Label>Type de ménage</Label>
              <Select value={moment} onValueChange={(v) => setMoment(v as "depart" | "sejour")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="depart">Ménage de départ</SelectItem>
                  <SelectItem value="sejour">Pendant le séjour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Repas</Label>
              <Select value={avecDejeuner ? "avec" : "sans"} onValueChange={(v) => setAvecDejeuner(v === "avec")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sans">Petit-déj seul</SelectItem>
                  <SelectItem value="avec">Petit-déj + déjeuner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Personne</Label>
            <Select value={personnelId} onValueChange={setPersonnelId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Ajout..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
