"use client";

import { X } from "lucide-react";
import { useSetPersonnelTab } from "@/components/app/personnel-tabs";

export function CloseCarteButton() {
  const setTab = useSetPersonnelTab();
  return (
    <button
      type="button"
      onClick={() => setTab("equipe")}
      aria-label="Fermer la carte"
      title="Fermer la carte"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-foreground/70 hover:bg-muted"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
