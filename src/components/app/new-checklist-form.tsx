"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createChecklist } from "@/lib/actions/inventaire";

export function NewChecklistForm({
  villas,
  defaultVillaId,
  defaultType,
}: {
  villas: { id: string; nom: string; numero: string }[];
  defaultVillaId?: string;
  defaultType?: string;
}) {
  const [villaId, setVillaId] = useState(defaultVillaId ?? "");
  const [type, setType] = useState(defaultType === "sortie" ? "sortie" : "entree");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!villaId) {
      toast.error("Sélectionne une villa.");
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("villaId", villaId);
        formData.set("type", type);
        const id = await createChecklist(formData);
        router.push(`/inventaire/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la création.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nouvel état des lieux</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Villa</Label>
          <Select value={villaId} onValueChange={setVillaId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner une villa" />
            </SelectTrigger>
            <SelectContent>
              {villas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nom} (n°{v.numero})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entree">État des lieux d&apos;entrée</SelectItem>
              <SelectItem value="sortie">État des lieux de sortie</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSubmit} disabled={isPending} className="w-full">
          {isPending ? "Création..." : "Créer et commencer"}
        </Button>
      </CardContent>
    </Card>
  );
}
