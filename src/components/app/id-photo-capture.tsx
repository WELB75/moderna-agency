"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_DIMENSION = 1400;

function resizeToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Image illisible."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export function IdPhotoCapture({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const dataUrl = await resizeToJpeg(file);
      onChange(dataUrl);
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {value ? (
        <div className="relative w-fit">
          <Image
            src={value}
            alt="Pièce d'identité"
            width={220}
            height={140}
            unoptimized
            className="h-32 w-auto rounded-md border object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-2 -top-2 h-6 w-6"
            onClick={() => onChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isProcessing}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {isProcessing ? "Traitement..." : "Prendre une photo"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Choisir un fichier
          </Button>
        </div>
      )}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
