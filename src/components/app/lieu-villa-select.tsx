"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DomaineLocation } from "@/components/app/domaine-location";

export type LieuDomaine = { id: string; nom: string; mapsUrl: string | null };
export type LieuVilla = { id: string; nom: string; numero: string; domaineId: string | null };

export function LieuVillaSelect({
  domaines,
  villas,
  domaineId,
  villaId,
  onDomaineChange,
  onVillaChange,
}: {
  domaines: LieuDomaine[];
  villas: LieuVilla[];
  domaineId: string;
  villaId: string;
  onDomaineChange: (id: string) => void;
  onVillaChange: (id: string) => void;
}) {
  const filteredVillas = domaineId ? villas.filter((v) => v.domaineId === domaineId) : villas;
  const selectedDomaine = domaines.find((d) => d.id === domaineId);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Domaine</Label>
        <Select
          value={domaineId}
          onValueChange={(v) => {
            onDomaineChange(v);
            onVillaChange("");
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir un domaine" />
          </SelectTrigger>
          <SelectContent>
            {domaines.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedDomaine ? (
          <DomaineLocation domaineId={selectedDomaine.id} mapsUrl={selectedDomaine.mapsUrl} />
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label>Villa / appartement</Label>
        <Select value={villaId} onValueChange={onVillaChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={filteredVillas.length ? "Choisir" : "Aucun logement"} />
          </SelectTrigger>
          <SelectContent>
            {filteredVillas.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nom} (n°{v.numero})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
