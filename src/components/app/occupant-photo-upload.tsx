"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IdPhotoCapture } from "@/components/app/id-photo-capture";
import { setOccupantPhoto } from "@/lib/actions/gendarmerie";

export function OccupantPhotoUpload({ occupantId }: { occupantId: string }) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(dataUrl: string) {
    setValue(dataUrl);
    if (!dataUrl) return;
    startTransition(async () => {
      try {
        await setOccupantPhoto(occupantId, dataUrl);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Envoi impossible.");
        setValue("");
      }
    });
  }

  return (
    <div className="rounded-md border border-dashed p-2">
      <IdPhotoCapture value={value} onChange={handleChange} label="Pièce d'identité (manquante)" />
      {isPending ? <p className="mt-1 text-xs text-muted-foreground">Envoi...</p> : null}
    </div>
  );
}
