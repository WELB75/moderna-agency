"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X, ScanLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { IdPhotoCapture } from "@/components/app/id-photo-capture";
import { submitGendarmerieOccupants, type OccupantInput } from "@/lib/actions/gendarmerie";
import { analyzePassportImagePublic } from "@/lib/actions/gendarmerie-import";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  LANG_LABELS,
  UI_TEXT,
  DATE_FIELD_KEYS,
  emptyOccupant,
  translateOcrWarning,
  type GendarmerieLang,
} from "@/lib/gendarmerie-i18n";

// Champs que la lecture passeport (IA ou repli MRZ, voir gendarmerie-import.ts) peut
// effectivement remplir — sert à ne fusionner que ceux-là dans l'occupant existant plutôt que
// d'écraser des champs déjà saisis (dateArrivee, allantA...) avec les valeurs vides du résultat.
const OCR_FIELDS = [
  "nom",
  "prenom",
  "dateNaissance",
  "nationalite",
  "venantDe",
  "typePiece",
  "numeroPiece",
  "lieuNaissance",
  "datePiece",
  "lieuPiece",
  "photoPieceUrl",
] as const satisfies readonly (keyof OccupantInput)[];

export function GendarmerieForm({
  formId,
  villaNom,
  hideAddOccupant = false,
  nbAdultes = 1,
  nbEnfants = 0,
  onSubmitted,
}: {
  formId: string;
  villaNom: string;
  hideAddOccupant?: boolean;
  nbAdultes?: number;
  nbEnfants?: number;
  onSubmitted?: () => void;
}) {
  const [lang, setLang] = useState<GendarmerieLang | null>(null);
  const [occupants, setOccupants] = useState<OccupantInput[]>(() =>
    Array.from({ length: Math.max(1, nbAdultes) }, emptyOccupant)
  );
  const [enfantsPhotos, setEnfantsPhotos] = useState<string[]>(() =>
    Array.from({ length: Math.max(0, nbEnfants) }, () => "")
  );
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRefs = useRef<(SignaturePadHandle | null)[]>([]);
  const [scanningIndex, setScanningIndex] = useState<number | null>(null);
  const scanInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function scanOccupant(index: number, file: File) {
    setScanningIndex(index);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await analyzePassportImagePublic(formId, formData);
      setOccupants((prev) =>
        prev.map((o, i) => {
          if (i !== index) return o;
          const merged = { ...o };
          for (const key of OCR_FIELDS) {
            if (result.occupant[key]) merged[key] = result.occupant[key];
          }
          return merged;
        })
      );
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => toast.warning(translateOcrWarning(w, lang!)));
      } else {
        toast.success(UI_TEXT[lang!].scanSuccess);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur / Error");
    } finally {
      setScanningIndex(null);
    }
  }

  if (!lang) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <p className="text-lg font-medium">Choose your language / Choisissez votre langue / Kies uw taal / اختر لغتك</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(LANG_LABELS) as GendarmerieLang[]).map((l) => (
            <Button key={l} variant="outline" onClick={() => setLang(l)}>
              {LANG_LABELS[l]}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const t = UI_TEXT[lang];
  const labels = FIELD_LABELS[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  if (submitted && !onSubmitted) {
    return (
      <div dir={dir} className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-lg font-medium">{t.success}</p>
      </div>
    );
  }

  function updateOccupant(index: number, key: keyof OccupantInput, value: string) {
    setOccupants((prev) => prev.map((o, i) => (i === index ? { ...o, [key]: value } : o)));
  }

  function handleSubmit() {
    const occupantsWithSignature = occupants.map((o, i) => {
      const pad = sigRefs.current[i];
      const signatureImage = pad && !pad.isEmpty() ? pad.toDataUrl() : "";
      return { ...o, signatureImage };
    });
    const enfantsPassportUrls = enfantsPhotos.filter(Boolean);
    startTransition(async () => {
      try {
        await submitGendarmerieOccupants(formId, lang!, occupantsWithSignature, enfantsPassportUrls);
        setSubmitted(true);
        onSubmitted?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / Error");
      }
    });
  }

  return (
    <div dir={dir} className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle(villaNom)}</p>
      </div>

      <div className="space-y-4">
        {occupants.map((occupant, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {t.occupant} {index + 1}
                </p>
                {occupants.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOccupants((prev) => prev.filter((_, i) => i !== index));
                      sigRefs.current = sigRefs.current.filter((_, i) => i !== index);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t.removeOccupant}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5 rounded-md border border-dashed p-3">
                <input
                  ref={(el) => {
                    scanInputRefs.current[index] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) scanOccupant(index, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={scanningIndex !== null}
                  onClick={() => scanInputRefs.current[index]?.click()}
                >
                  {scanningIndex === index ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t.scanning}
                    </>
                  ) : (
                    <>
                      <ScanLine className="h-4 w-4" />
                      {t.scanPassportButton}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">{t.scanHint}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELD_KEYS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{labels[key]}</Label>
                    <Input
                      type={DATE_FIELD_KEYS.includes(key) ? "date" : "text"}
                      value={occupant[key]}
                      onChange={(e) => updateOccupant(index, key, e.target.value)}
                      dir={DATE_FIELD_KEYS.includes(key) ? "ltr" : dir}
                    />
                  </div>
                ))}
              </div>
              <IdPhotoCapture
                value={occupant.photoPieceUrl}
                onChange={(dataUrl) => updateOccupant(index, "photoPieceUrl", dataUrl)}
                label={t.photoPiece}
              />
              <SignaturePad
                ref={(el) => {
                  sigRefs.current[index] = el;
                }}
                label={t.signature}
                clearLabel={t.signatureClear}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="font-medium">{t.childrenTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.childrenSubtitle}</p>
        </div>
        {enfantsPhotos.length > 0 ? (
          <Card>
            <CardContent className="space-y-4 py-4">
              {enfantsPhotos.map((photo, index) => (
                <div key={index} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <IdPhotoCapture
                      value={photo}
                      onChange={(dataUrl) =>
                        setEnfantsPhotos((prev) => prev.map((p, i) => (i === index ? dataUrl : p)))
                      }
                      label={t.childPhotoLabel(index + 1)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEnfantsPhotos((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t.removeOccupant}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Button type="button" variant="outline" onClick={() => setEnfantsPhotos((prev) => [...prev, ""])}>
          <Plus className="h-4 w-4" />
          {t.addChild}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!hideAddOccupant ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOccupants((prev) => [...prev, emptyOccupant()])}
          >
            <Plus className="h-4 w-4" />
            {t.addOccupant}
          </Button>
        ) : null}
        <Button type="button" disabled={isPending} onClick={handleSubmit} className="ml-auto">
          {isPending ? t.submitting : t.submit}
        </Button>
      </div>
    </div>
  );
}
