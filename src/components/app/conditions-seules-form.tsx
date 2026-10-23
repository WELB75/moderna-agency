"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { ConditionsAcceptation } from "@/components/app/conditions-acceptation";
import { signerConditionsSeules } from "@/lib/actions/contrats";
import { ACCEPTATION_TEXTE, SIGNATURE_SEULE_TEXTE, type ConditionsLang, type ConditionsSejourData } from "@/lib/conditions-sejour";

// Écran de /g/[id] quand la fiche police est déjà remplie mais pas les conditions de séjour :
// tout est pré-rempli (identité lue sur la pièce d'identité, logement, dates, personnes, caution),
// le client relit, coche et signe. Aucune saisie.
export function ConditionsSeulesForm({
  formId,
  lang,
  conditions,
}: {
  formId: string;
  lang: ConditionsLang;
  conditions: ConditionsSejourData;
}) {
  const t = SIGNATURE_SEULE_TEXTE[lang];
  const [accepte, setAccepte] = useState(false);
  const [signe, setSigne] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignaturePadHandle>(null);
  const dir = lang === "ar" ? "rtl" : "ltr";

  if (signe) {
    return (
      <div dir={dir} className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-lg font-medium">{t.merci}</p>
      </div>
    );
  }

  function envoyer() {
    if (!accepte) {
      toast.error(ACCEPTATION_TEXTE[lang].erreurCase);
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error(t.erreurSignature);
      return;
    }
    const image = sigRef.current.toDataUrl();
    startTransition(async () => {
      try {
        await signerConditionsSeules(formId, image);
        setSigne(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div dir={dir} className="space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="space-y-1.5 text-center">
        <h1 className="text-lg font-semibold">{t.titre}</h1>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </div>

      <ConditionsAcceptation data={conditions} lang={lang} accepte={accepte} onAccepteChange={setAccepte} sansAide />

      <Card>
        <CardContent className="space-y-3 py-4">
          <SignaturePad ref={sigRef} label={t.signature} clearLabel={t.effacer} />
        </CardContent>
      </Card>

      <Button type="button" disabled={isPending} onClick={envoyer} className="h-12 w-full text-base md:h-9 md:text-sm">
        {isPending ? t.envoi : t.bouton}
      </Button>
    </div>
  );
}
