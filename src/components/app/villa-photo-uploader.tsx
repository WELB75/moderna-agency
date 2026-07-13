"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateVillaPhoto } from "@/lib/actions/villas";

export function VillaPhotoUploader({
  villaId,
  photoUrl,
}: {
  villaId: string;
  photoUrl: string | null;
}) {
  const [url, setUrl] = useState(photoUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`villas/${villaId}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      await updateVillaPhoto(villaId, blob.url);
      setUrl(blob.url);
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-md border bg-muted">
      {url ? (
        <div className="relative h-40 w-full sm:h-56">
          <Image src={url} alt="" fill sizes="(min-width: 640px) 640px, 100vw" className="object-cover" />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Aucune photo
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute bottom-2 right-2"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {url ? "Changer la photo" : "Ajouter une photo"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
