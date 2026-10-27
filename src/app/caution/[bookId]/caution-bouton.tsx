"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CautionBouton({ libelle, libelleEnCours }: { libelle: string; libelleEnCours: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full gap-2 text-base">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
      {pending ? libelleEnCours : libelle}
    </Button>
  );
}
