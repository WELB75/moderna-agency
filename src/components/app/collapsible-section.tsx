"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Repli avec transition douce (grid-template-rows 0fr → 1fr, marche partout y compris Safari
// iOS, contrairement à <details> qui s'ouvre/ferme sans animation) — pour libérer de la place
// sur des blocs volumineux (ex. plan du domaine) sans les enlever complètement.
export function CollapsibleSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        {open ? `Masquer ${label.toLowerCase()}` : `Voir ${label.toLowerCase()}`}
      </Button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
