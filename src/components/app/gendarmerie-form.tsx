"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { submitGendarmerieOccupants, type OccupantInput } from "@/lib/actions/gendarmerie";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  LANG_LABELS,
  UI_TEXT,
  emptyOccupant,
  type GendarmerieLang,
} from "@/lib/gendarmerie-i18n";

export function GendarmerieForm({ formId, villaNom }: { formId: string; villaNom: string }) {
  const [lang, setLang] = useState<GendarmerieLang | null>(null);
  const [occupants, setOccupants] = useState<OccupantInput[]>([emptyOccupant()]);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!lang) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <p className="text-lg font-medium">Choose your language / Choisissez votre langue / اختر لغتك</p>
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

  if (submitted) {
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
    startTransition(async () => {
      try {
        await submitGendarmerieOccupants(formId, lang!, occupants);
        setSubmitted(true);
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
                    onClick={() => setOccupants((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t.removeOccupant}
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELD_KEYS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{labels[key]}</Label>
                    <Input
                      value={occupant[key]}
                      onChange={(e) => updateOccupant(index, key, e.target.value)}
                      dir={dir}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOccupants((prev) => [...prev, emptyOccupant()])}
        >
          <Plus className="h-4 w-4" />
          {t.addOccupant}
        </Button>
        <Button type="button" disabled={isPending} onClick={handleSubmit} className="ml-auto">
          {isPending ? t.submitting : t.submit}
        </Button>
      </div>
    </div>
  );
}
