"use client";

import { useState } from "react";
import { GendarmerieForm } from "@/components/app/gendarmerie-form";
import { GendarmerieSignatureForm, type PrefilledOccupant } from "@/components/app/gendarmerie-signature-form";
import { ContratForm } from "@/components/app/contrat-form";
import type { ConditionsSejourData } from "@/lib/conditions-sejour";

type FormRow = {
  id: string;
  statut: string;
  nbAdultes: number;
  nbEnfants: number;
  // Occupants déjà saisis par le staff (statut "attente_signature") : le client relit et signe.
  occupants: PrefilledOccupant[];
};

// Dossier généré depuis Documents : fiche police (une fiche de groupe — ou, pour les anciens
// dossiers, une fiche par adulte) puis signature des Conditions de séjour, en une seule visite.
export function DossierFlow({
  forms,
  villaNom,
  contratId,
  conditions,
  signatureAgenceImage,
}: {
  forms: FormRow[];
  villaNom: string;
  contratId: string;
  conditions: ConditionsSejourData;
  signatureAgenceImage: string | null;
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(
    new Set(forms.filter((f) => f.statut === "complete").map((f) => f.id))
  );

  const remaining = forms.filter((f) => !doneIds.has(f.id));
  const parAdulte = forms.length > 1;

  if (remaining.length > 0) {
    const current = remaining[0];
    const stepNumber = forms.length - remaining.length + 1;
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Étape {stepNumber} / {forms.length + 1} — {parAdulte ? `Identité de la personne ${stepNumber}` : "Fiche de police"}
        </p>
        {current.statut === "attente_signature" && current.occupants.length > 0 ? (
          <GendarmerieSignatureForm
            key={current.id}
            formId={current.id}
            villaNom={villaNom}
            occupants={current.occupants}
            onSubmitted={() => setDoneIds((prev) => new Set(prev).add(current.id))}
          />
        ) : (
        <GendarmerieForm
          key={current.id}
          formId={current.id}
          villaNom={villaNom}
          hideAddOccupant={parAdulte}
          nbAdultes={parAdulte ? 1 : current.nbAdultes}
          nbEnfants={parAdulte ? 0 : current.nbEnfants}
          onSubmitted={() => setDoneIds((prev) => new Set(prev).add(current.id))}
        />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Étape {forms.length + 1} / {forms.length + 1} — Conditions de séjour
      </p>
      <ContratForm contratId={contratId} conditions={conditions} signatureAgenceImage={signatureAgenceImage} />
    </div>
  );
}
