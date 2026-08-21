"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runDamageComparison } from "@/lib/actions/inventaire";

export function CompareWithEntreeButton({
  checklistId,
  hasEntree,
  comparedAt,
}: {
  checklistId: string;
  hasEntree: boolean;
  comparedAt: Date | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      try {
        const { analyses, differences } = await runDamageComparison(checklistId);
        if (analyses === 0) {
          toast.info("Aucun objet avec photo à analyser côté sortie.");
        } else {
          toast.success(`${analyses} objet(s) analysé(s), ${differences} différence(s) détectée(s).`);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la comparaison.");
      }
    });
  }

  if (!hasEntree) {
    return <p className="text-sm text-muted-foreground">Aucun état des lieux d&apos;entrée trouvé pour cette villa.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {comparedAt ? "Relancer la comparaison" : "Comparer avec l'état d'entrée"}
      </Button>
      {comparedAt && (
        <p className="text-xs text-muted-foreground">
          Dernière comparaison le {format(comparedAt, "d MMM yyyy HH:mm", { locale: fr })}
        </p>
      )}
    </div>
  );
}
