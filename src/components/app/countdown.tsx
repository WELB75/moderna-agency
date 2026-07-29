"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { nowInMorocco } from "@/lib/now";

function formatRemaining(ms: number) {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function Countdown({ target, className }: { target: Date; className?: string }) {
  const [now, setNow] = useState(() => nowInMorocco());

  useEffect(() => {
    const interval = setInterval(() => setNow(nowInMorocco()), 30000);
    return () => clearInterval(interval);
  }, []);

  const diff = target.getTime() - now.getTime();
  const label = formatRemaining(diff);

  if (label === null) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)} suppressHydrationWarning>
        En cours / passé
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className} suppressHydrationWarning>
      Dans {label}
    </Badge>
  );
}
