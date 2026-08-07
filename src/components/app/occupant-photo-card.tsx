"use client";

import { useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Download, RotateCcw, RotateCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rotateOccupantPhoto } from "@/lib/actions/gendarmerie";

export function OccupantPhotoCard({
  occupantId,
  photoPieceUrl,
  downloadName,
}: {
  occupantId: string;
  photoPieceUrl: string;
  downloadName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRotate(degrees: 90 | -90) {
    startTransition(async () => {
      try {
        await rotateOccupantPhoto(occupantId, degrees);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Rotation impossible.");
      }
    });
  }

  return (
    <div className="rounded-md border bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2 print:block">
        <p className="text-xs text-muted-foreground">Pièce d&apos;identité</p>
        <a
          href={photoPieceUrl}
          download={downloadName}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden"
        >
          <Download className="h-3 w-3" />
          Télécharger
        </a>
      </div>
      <div className="flex items-start gap-2">
        <Image
          src={photoPieceUrl}
          alt="Pièce d'identité"
          width={300}
          height={200}
          unoptimized
          className="h-40 w-64 rounded object-cover"
        />
        <div className="flex flex-col gap-1 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={isPending}
            onClick={() => handleRotate(-90)}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" variant="outline" size="icon" disabled={isPending} onClick={() => handleRotate(90)}>
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
