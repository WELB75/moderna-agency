"use client";

import { useTransition } from "react";
import { Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { linkVillasToBeds24 } from "@/lib/actions/beds24";
import { cn } from "@/lib/utils";

// Bascule SuperHote -> Beds24 : lie chaque villa à sa chambre Beds24 (voir
// src/lib/beds24/mapping.ts). Ré-exécutable sans risque ; le détail (liées, ambiguës,
// introuvables) s'affiche dans la notification.
export function LinkBeds24Button({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      className={cn("justify-center", className)}
      onClick={() =>
        startTransition(async () => {
          try {
            const report = await linkVillasToBeds24();
            const hasIssues = report.ambiguous.length > 0 || report.notFound.length > 0;
            if (hasIssues) toast.warning(report.message, { duration: 15000 });
            else toast.success(report.message, { duration: 8000 });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Échec de la liaison des villas à Beds24.");
          }
        })
      }
    >
      <LinkIcon className={isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
      Lier les villas à Beds24
    </Button>
  );
}
