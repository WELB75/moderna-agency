"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { signGendarmerieOccupants } from "@/lib/actions/gendarmerie";
import { FIELD_KEYS, FIELD_LABELS, LANG_LABELS, UI_TEXT, type GendarmerieLang } from "@/lib/gendarmerie-i18n";

export type PrefilledOccupant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  profession: string | null;
  venantDe: string | null;
  allantA: string | null;
  dateArrivee: string | null;
  domicileHabituel: string | null;
  typePiece: string | null;
  numeroPiece: string | null;
  datePiece: string | null;
  lieuPiece: string | null;
};

// Cas d'usage : Kamel a déjà rempli les informations de chaque occupant depuis les photos de
// passeport/CIN reçues sur WhatsApp (via prefillGendarmerieOccupants) — le client n'a plus qu'à
// relire ce qui est déjà saisi (lecture seule) et signer, au lieu de tout ressaisir.
export function GendarmerieSignatureForm({
  formId,
  villaNom,
  occupants,
}: {
  formId: string;
  villaNom: string;
  occupants: PrefilledOccupant[];
}) {
  const [lang, setLang] = useState<GendarmerieLang | null>(null);
  const [noms, setNoms] = useState<string[]>(() => occupants.map(() => ""));
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRefs = useRef<(SignaturePadHandle | null)[]>([]);

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
  // Les champs d'identité (pas la signature, gérée à part ci-dessous).
  const readOnlyKeys = FIELD_KEYS.filter((k) => k !== "signatureNom");

  if (submitted) {
    return (
      <div dir={dir} className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-lg font-medium">{t.success}</p>
      </div>
    );
  }

  function handleSubmit() {
    const signatures = occupants.map((o, i) => {
      const pad = sigRefs.current[i];
      return {
        occupantId: o.id,
        signatureNom: noms[i] ?? "",
        signatureImage: pad && !pad.isEmpty() ? pad.toDataUrl() : "",
      };
    });
    startTransition(async () => {
      try {
        await signGendarmerieOccupants(formId, lang!, signatures);
        setSubmitted(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / Error");
      }
    });
  }

  return (
    <div dir={dir} className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-xl font-bold">{t.signOnlyTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.signOnlySubtitle(villaNom)}</p>
      </div>

      <div className="space-y-4">
        {occupants.map((occupant, index) => (
          <Card key={occupant.id}>
            <CardContent className="space-y-3 py-4">
              <p className="font-medium">
                {t.occupant} {index + 1}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {readOnlyKeys.map((key) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{labels[key]}</Label>
                    <p className="text-sm font-medium">{occupant[key] || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 border-t pt-3">
                <Label>{t.signOnlyConfirmName}</Label>
                <Input
                  value={noms[index] ?? ""}
                  onChange={(e) => setNoms((prev) => prev.map((n, i) => (i === index ? e.target.value : n)))}
                  dir={dir}
                />
              </div>
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

      <div className="flex justify-end">
        <Button type="button" disabled={isPending} onClick={handleSubmit}>
          {isPending ? t.submitting : t.submit}
        </Button>
      </div>
    </div>
  );
}
