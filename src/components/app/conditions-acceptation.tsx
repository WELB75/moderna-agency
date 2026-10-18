"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ConditionsSejourDocument } from "@/components/app/contrat-document";
import { ACCEPTATION_TEXTE, type ConditionsLang, type ConditionsSejourData } from "@/lib/conditions-sejour";

// Dernière étape de la fiche police (/g/[id]) : conditions de séjour dans la langue choisie,
// case à cocher ; la signature de l'occupant 1 (déjà dessinée plus haut) vaut signature.
export function ConditionsAcceptation({
  data,
  lang,
  accepte,
  onAccepteChange,
}: {
  data: ConditionsSejourData;
  lang: ConditionsLang;
  accepte: boolean;
  onAccepteChange: (value: boolean) => void;
}) {
  const t = ACCEPTATION_TEXTE[lang];
  return (
    <Card>
      <CardContent className="space-y-3 px-3 py-4 sm:px-4">
        <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/20 p-3">
          <ConditionsSejourDocument data={data} lang={lang} />
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="accepte-conditions"
            checked={accepte}
            onCheckedChange={(v) => onAccepteChange(v === true)}
            className="mt-0.5 size-5"
          />
          <Label htmlFor="accepte-conditions" className="font-normal leading-snug">
            {t.case}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">{t.aide}</p>
      </CardContent>
    </Card>
  );
}
