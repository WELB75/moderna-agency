"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";

export function DocumentRow({
  href,
  title,
  subtitle,
  badgeLabel,
  badgeVariant,
  deleteAction,
}: {
  href: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeVariant: "default" | "outline";
  deleteAction: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3 hover:border-primary/50">
      <Link href={href} className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
        <ConfirmDeleteButton
          action={deleteAction}
          title="Supprimer ce document ?"
          description="Cette action est irréversible."
        />
      </div>
    </div>
  );
}
