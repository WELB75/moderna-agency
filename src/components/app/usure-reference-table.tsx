"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  createUsureReference,
  updateUsureReference,
  deleteUsureReference,
  seedDefaultUsureReferences,
} from "@/lib/actions/usure-references";

type UsureReference = {
  id: string;
  typeObjet: string;
  dureeVieAttendueMois: number | null;
  criteres: string | null;
};

function ReferenceRow({ reference }: { reference: UsureReference }) {
  const [typeObjet, setTypeObjet] = useState(reference.typeObjet);
  const [duree, setDuree] = useState(reference.dureeVieAttendueMois?.toString() ?? "");
  const [criteres, setCriteres] = useState(reference.criteres ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      try {
        await updateUsureReference(reference.id, {
          typeObjet,
          dureeVieAttendueMois: duree.trim() ? Number(duree) : null,
          criteres,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteUsureReference(reference.id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_140px_2fr_auto] sm:items-start">
      <Input value={typeObjet} onChange={(e) => setTypeObjet(e.target.value)} onBlur={save} placeholder="Type d'objet" />
      <Input
        value={duree}
        onChange={(e) => setDuree(e.target.value)}
        onBlur={save}
        placeholder="Durée de vie (mois)"
        inputMode="numeric"
      />
      <Textarea
        value={criteres}
        onChange={(e) => setCriteres(e.target.value)}
        onBlur={save}
        placeholder="Ce qui distingue usure normale et dégât facturable pour ce type d'objet"
        rows={2}
        className="text-sm"
      />
      <Button type="button" variant="ghost" size="icon" onClick={handleDelete} disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      </Button>
    </div>
  );
}

export function UsureReferenceTable({ references }: { references: UsureReference[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd() {
    startTransition(async () => {
      await createUsureReference();
      router.refresh();
    });
  }

  function handleSeed() {
    startTransition(async () => {
      await seedDefaultUsureReferences();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Grille de référence usure normale vs dégât facturable, par type d&apos;objet — sert de repère pour l&apos;IA
        lors de la comparaison entrée/sortie et pour trancher à la main. À ajuster une fois les règles de garantie
        clarifiées avec Moderna.
      </p>

      {references.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">Aucune grille définie pour l&apos;instant.</p>
            <Button type="button" size="sm" onClick={handleSeed} disabled={isPending}>
              <Sparkles className="h-4 w-4" />
              Initialiser les valeurs par défaut
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {references.map((ref) => (
            <ReferenceRow key={ref.id} reference={ref} />
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={isPending}>
        <Plus className="h-4 w-4" />
        Ajouter un type d&apos;objet
      </Button>
    </div>
  );
}
