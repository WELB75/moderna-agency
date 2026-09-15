"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddReservationWizard } from "@/components/app/add-reservation-wizard";
import type { PersonnelOption } from "@/lib/personnel-options";

// Depuis la fiche villa : la villa est déjà connue, l'assistant démarre directement à l'étape
// "Séjour" (voir add-reservation-wizard.tsx pour la version avec sélecteur de logement, utilisée
// par la page /reservations/nouvelle accessible depuis la nav).
export function AddReservationDialog({
  villaId,
  villaLabel,
  menageOptions,
  cuisineOptions,
  villaPriceDefaults,
}: {
  villaId: string;
  villaLabel?: string;
  menageOptions?: PersonnelOption[];
  cuisineOptions?: PersonnelOption[];
  villaPriceDefaults?: Record<string, { caution: number; menage: number; prixNuit: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Réservation manuelle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une réservation</DialogTitle>
          <DialogDescription>{villaLabel ?? "Pour les réservations qui ne viennent pas de Superhote."}</DialogDescription>
        </DialogHeader>
        <AddReservationWizard
          key={key}
          initialVillaId={villaId}
          menageOptions={menageOptions}
          cuisineOptions={cuisineOptions}
          villaPriceDefaults={villaPriceDefaults}
          onCreated={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
