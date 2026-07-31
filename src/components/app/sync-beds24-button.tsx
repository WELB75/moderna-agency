"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerBeds24Sync } from "@/lib/actions/beds24";
import { cn } from "@/lib/utils";

export function SyncBeds24Button({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      className={cn("justify-center", className)}
      onClick={() =>
        startTransition(async () => {
          const result = await triggerBeds24Sync();
          if (result.success) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      Synchroniser Beds24
    </Button>
  );
}
