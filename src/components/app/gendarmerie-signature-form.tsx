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
import { ConditionsAcceptation } from "@/components/app/conditions-acceptation";
import { ACCEPTATION_TEXTE, type ConditionsSejourData } from "@/lib/conditions-sejour";

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
  conditions = null,
  onSubmitted,
}: {
  formId: string;
  villaNom: string;
  occupants: PrefilledOccupant[];
  conditions?: ConditionsSejourData | null;
  // Utilisé par le dossier combiné (DossierFlow) pour enchaîner sur l'étape suivante au lieu
  // d'afficher le message de remerciement.
  onSubmitted?: () => void;
}) {
  const [lang, setLang] = useState<GendarmerieLang | null>(null);
  const [noms, setNoms] = useState<string[]>(() => occupants.map(() => ""));
  const [submitted, setSubmitted] = useState(false);
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRefs = useRef<(SignaturePadHandle | null)[]>([]);

  if (!lang) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-1 py-8 text-center md:py-12">
        <p className="text-lg font-medium">Choose your language / Choisissez votre langue / Kies uw taal / اختر لغتك</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(LANG_LABELS) as GendarmerieLang[]).map((l) => (
            <Button key={l} variant="outline" className="h-12 text-base md:h-8 md:text-sm" onClick={() => setLang(l)}>
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
    if (conditions) {
      const texte = ACCEPTATION_TEXTE[lang!];
      if (!accepteConditions) {
        toast.error(texte.erreurCase);
        return;
      }
      const premiereSignature = sigRefs.current[0];
      if (!premiereSignature || premiereSignature.isEmpty() || !(noms[0] ?? "").trim()) {
        toast.error(texte.erreurSignature);
        return;
      }
    }
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
        await signGendarmerieOccupants(formId, lang!, signatures, Boolean(conditions));
        if (onSubmitted) onSubmitted();
        else setSubmitted(true);
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
            <CardContent className="space-y-3 px-3 py-4 sm:px-4">
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
                  className="h-11 md:h-8"
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

      {conditions ? (
        <ConditionsAcceptation
          data={conditions}
          lang={lang}
          accepte={accepteConditions}
          onAccepteChange={setAccepteConditions}
        />
      ) : null}

      <div className="flex justify-end pb-[env(safe-area-inset-bottom)]">
        <Button type="button" disabled={isPending} onClick={handleSubmit} className="h-12 w-full text-base md:h-8 md:w-auto md:text-sm">
          {isPending ? t.submitting : t.submit}
        </Button>
      </div>
    </div>
  );
}
