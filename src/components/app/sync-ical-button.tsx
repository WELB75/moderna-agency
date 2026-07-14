"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerIcalSync } from "@/lib/actions/reservations";

export function SyncIcalButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await triggerIcalSync();
          if (result.success) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      Synchroniser calendriers
    </Button>
  );
}
