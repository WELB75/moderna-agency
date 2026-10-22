"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ajouterPieceInventaire } from "@/lib/actions/villa-inventaire";

export function VillaInventaireAjout({
  villaId,
  nbChambres,
  nbSallesDeBain,
}: {
  villaId: string;
  nbChambres: number;
  nbSallesDeBain: number;
}) {
  const [pending, startTransition] = useTransition();
  const [zone, setZone] = useState("");

  function ajouter(type: string, libelle: string) {
    startTransition(async () => {
      try {
        await ajouterPieceInventaire(villaId, type, libelle);
      } catch {
        toast.error("Impossible d'ajouter la pièce.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => ajouter("chambre", `Chambre ${nbChambres + 1}`)}>
        <Plus className="h-4 w-4" />
        Chambre
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => ajouter("salle_de_bain", `Salle de bain ${nbSallesDeBain + 1}`)}
      >
        <Plus className="h-4 w-4" />
        Salle de bain
      </Button>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!zone.trim()) return;
          ajouter("zone", zone);
          setZone("");
        }}
      >
        <input
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Autre zone (cuisine, salon...)"
          className="h-8 w-52 rounded-md border bg-transparent px-2 text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !zone.trim()}>
          <Plus className="h-4 w-4" />
          Zone
        </Button>
      </form>
    </div>
  );
}
