import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Moderna Agency"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
