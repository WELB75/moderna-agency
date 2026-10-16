"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({
  path,
  label,
  successMessage,
  iconOnly = false,
}: {
  path: string;
  label: string;
  successMessage: string;
  iconOnly?: boolean;
}) {
  async function handleCopy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(successMessage);
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  }

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="shrink-0 max-md:size-11"
        aria-label={label}
        title={label}
      >
        <Copy className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="max-md:h-10">
      <Copy className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
