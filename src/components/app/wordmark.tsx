import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans font-light uppercase tracking-[0.28em]", className)}>
      Moderna <span className="font-medium">Agency</span>
    </span>
  );
}
