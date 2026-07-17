export type Etape = "signale" | "contacte" | "planifie" | "en_cours" | "termine";

export const INTERVENTION_STEPS: { key: Etape; label: string }[] = [
  { key: "signale", label: "Signalé" },
  { key: "contacte", label: "Contacté" },
  { key: "planifie", label: "Planifié" },
  { key: "en_cours", label: "En cours" },
  { key: "termine", label: "Terminé" },
];

export const INTERVENTION_STEP_TIMESTAMP_KEYS: Record<
  Etape,
  "signaleAt" | "contacteAt" | "planifieAt" | "debutAt" | "finAt"
> = {
  signale: "signaleAt",
  contacte: "contacteAt",
  planifie: "planifieAt",
  en_cours: "debutAt",
  termine: "finAt",
};
