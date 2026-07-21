"use client";

import { useState } from "react";
import { GendarmerieForm } from "@/components/app/gendarmerie-form";
import { ContratForm } from "@/components/app/contrat-form";
import type { ContratDocumentData } from "@/components/app/contrat-document";

type FormRow = { id: string; statut: string };

export function DossierFlow({
  forms,
  villaNom,
  contrat,
}: {
  forms: FormRow[];
  villaNom: string;
  contrat: ContratDocumentData & { id: string; signatureAgenceImage: string | null };
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(
    new Set(forms.filter((f) => f.statut === "complete").map((f) => f.id))
  );

  const remaining = forms.filter((f) => !doneIds.has(f.id));

  if (remaining.length > 0) {
    const current = remaining[0];
    const stepNumber = forms.length - remaining.length + 1;
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Étape {stepNumber} / {forms.length + 1} — Identité de la personne {stepNumber}
        </p>
        <GendarmerieForm
          key={current.id}
          formId={current.id}
          villaNom={villaNom}
          hideAddOccupant
          onSubmitted={() => setDoneIds((prev) => new Set(prev).add(current.id))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Étape {forms.length + 1} / {forms.length + 1} — Contrat de location
      </p>
      <ContratForm contrat={contrat} />
    </div>
  );
}
