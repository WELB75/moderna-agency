"use client";

import { useState, useTransition, useRef } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Check, X, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  updateItemStatus,
  updateItemComment,
  addItemPhoto,
  removeItemPhoto,
  updateItemClassification,
  updateItemPriseEnCharge,
  updateItemMontantEstime,
} from "@/lib/actions/inventaire";

type ItemStatus = "non_verifie" | "ok" | "probleme";
type CompareStatus = "non_analyse" | "rien_a_signaler" | "difference_detectee";
type Classification = "a_definir" | "usure_normale" | "degat_facturable" | "a_arbitrer_moderna";
type PriseEnCharge = "a_definir" | "proprietaire" | "moderna" | "locataire";

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  a_definir: "À définir",
  usure_normale: "Usure normale",
  degat_facturable: "Dégât facturable",
  a_arbitrer_moderna: "À arbitrer avec Moderna",
};

const PRISE_EN_CHARGE_LABELS: Record<PriseEnCharge, string> = {
  a_definir: "À définir",
  proprietaire: "Propriétaire",
  moderna: "Moderna",
  locataire: "Locataire",
};

export function SortieItemRow({
  item,
  entreePhotoUrls,
  readOnly,
}: {
  item: {
    id: string;
    libelle: string;
    status: ItemStatus;
    commentaire: string | null;
    photoUrls: string[];
    compareStatus: CompareStatus;
    compareExplication: string | null;
    usureClassification: Classification;
    priseEnCharge: PriseEnCharge;
    montantEstime: string | null;
  };
  entreePhotoUrls: string[];
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [commentaire, setCommentaire] = useState(item.commentaire ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(item.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [classification, setClassification] = useState<Classification>(item.usureClassification);
  const [priseEnCharge, setPriseEnCharge] = useState<PriseEnCharge>(item.priseEnCharge);
  const [montant, setMontant] = useState(item.montantEstime ?? "");
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleStatusChange(next: ItemStatus) {
    if (readOnly) return;
    const value = status === next ? "non_verifie" : next;
    setStatus(value);
    startTransition(() => {
      updateItemStatus(item.id, value).catch(() => toast.error("Erreur lors de la mise à jour."));
    });
  }

  function handleCommentBlur() {
    if (readOnly) return;
    startTransition(() => {
      updateItemComment(item.id, commentaire).catch(() => toast.error("Erreur lors de l'enregistrement."));
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`inventaire/${item.id}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setPhotoUrls((prev) => [...prev, blob.url]);
      await addItemPhoto(item.id, blob.url);
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
    try {
      await removeItemPhoto(item.id, url);
    } catch {
      toast.error("Erreur lors de la suppression.");
    }
  }

  function handleClassificationChange(next: Classification) {
    setClassification(next);
    startTransition(() => {
      updateItemClassification(item.id, next).catch(() => toast.error("Erreur lors de la mise à jour."));
    });
  }

  function handlePriseEnChargeChange(next: PriseEnCharge) {
    setPriseEnCharge(next);
    startTransition(() => {
      updateItemPriseEnCharge(item.id, next).catch(() => toast.error("Erreur lors de la mise à jour."));
    });
  }

  function handleMontantBlur() {
    startTransition(() => {
      updateItemMontantEstime(item.id, montant).catch(() => toast.error("Erreur lors de l'enregistrement."));
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{item.libelle}</p>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant={status === "ok" ? "default" : "outline"}
              className={cn("h-8 px-2.5", status === "ok" && "bg-emerald-600 hover:bg-emerald-700")}
              onClick={() => handleStatusChange("ok")}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={status === "probleme" ? "default" : "outline"}
              className={cn("h-8 px-2.5", status === "probleme" && "bg-destructive hover:bg-destructive/90")}
              onClick={() => handleStatusChange("probleme")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {readOnly && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              status === "ok" && "bg-emerald-500/10 text-emerald-600",
              status === "probleme" && "bg-destructive/10 text-destructive",
              status === "non_verifie" && "bg-muted text-muted-foreground"
            )}
          >
            {status === "ok" ? "OK" : status === "probleme" ? "Problème" : "Non vérifié"}
          </span>
        )}
      </div>

      {!readOnly ? (
        <Textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          onBlur={handleCommentBlur}
          placeholder="Commentaire (optionnel)"
          rows={1}
          className="min-h-9 text-sm"
        />
      ) : commentaire ? (
        <p className="text-sm text-muted-foreground">{commentaire}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {entreePhotoUrls.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Entrée</p>
            <div className="flex flex-wrap gap-2">
              {entreePhotoUrls.map((url) => (
                <div key={url} className="relative h-16 w-16 overflow-hidden rounded-md border opacity-80">
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1">
          {entreePhotoUrls.length > 0 && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sortie</p>}
          <div className="flex flex-wrap items-center gap-2">
            {photoUrls.map((url) => (
              <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-md border">
                <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(url)}
                    className="absolute right-0 top-0 rounded-bl-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-16 w-16 flex-col gap-1 text-xs"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Photo
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      {item.compareStatus !== "non_analyse" && (
        <div className="space-y-2 rounded-md border border-dashed p-2">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
              item.compareStatus === "difference_detectee" && "bg-amber-500/10 text-amber-700",
              item.compareStatus === "rien_a_signaler" && "bg-emerald-500/10 text-emerald-600"
            )}
          >
            {item.compareStatus === "difference_detectee" ? "Différence détectée par l'IA" : "RAS (IA)"}
          </span>
          {item.compareExplication && <p className="text-xs text-muted-foreground">{item.compareExplication}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select value={classification} onValueChange={(v) => handleClassificationChange(v as Classification)} disabled={readOnly}>
              <SelectTrigger className="h-8 w-auto text-xs">
                <SelectValue>{CLASSIFICATION_LABELS[classification]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {classification === "degat_facturable" && (
              <>
                <Select value={priseEnCharge} onValueChange={(v) => handlePriseEnChargeChange(v as PriseEnCharge)} disabled={readOnly}>
                  <SelectTrigger className="h-8 w-auto text-xs">
                    <SelectValue>{PRISE_EN_CHARGE_LABELS[priseEnCharge]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRISE_EN_CHARGE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  onBlur={handleMontantBlur}
                  placeholder="Montant estimé (DH)"
                  disabled={readOnly}
                  className="h-8 w-36 text-xs"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
