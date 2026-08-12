"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Share2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";

export function GendarmerieAction({
  reservationId,
  villaId,
  existingForm,
}: {
  reservationId: string;
  villaId: string;
  existingForm: { id: string; statut: string } | null;
}) {
  const [form, setForm] = useState(existingForm);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      try {
        const created = await createGendarmerieForm(reservationId, villaId);
        setForm({ id: created.id, statut: created.statut });
        await navigator.clipboard.writeText(`${window.location.origin}/g/${created.id}`);
        toast.success("Fiche créée, lien copié — envoie-le au client.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  async function handleCopyLink() {
    if (!form) return;
    await navigator.clipboard.writeText(`${window.location.origin}/g/${form.id}`);
    toast.success("Lien copié.");
  }

  if (!form) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleCreate}>
        <FileText className="h-3.5 w-3.5" />
        Fiche gendarmerie
      </Button>
    );
  }

  if (form.statut === "complete") {
    return (
      <Button type="button" variant="outline" size="sm" asChild>
        <Link href={`/gendarmerie/${form.id}`}>
          <Eye className="h-3.5 w-3.5" />
          Voir la fiche gendarmerie
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">Fiche gendarmerie : en attente</Badge>
      <Button type="button" variant="ghost" size="sm" onClick={handleCopyLink}>
        <Share2 className="h-3.5 w-3.5" />
        Copier le lien
      </Button>
    </div>
  );
}
