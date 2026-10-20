import { cn } from "@/lib/utils";

// Logo Superhosts (même dessin que logo.svg sur superhosts.ma) : carré arrondi bordeaux #660033,
// étoile blanche à 4 branches. En SVG inline pour rester net à toutes les tailles (menu 28px,
// page de connexion, documents imprimés) sans fichier à charger.
export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Superhosts"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="#660033" />
      <path d="M16 6.5l2.6 6.9 6.9 2.6-6.9 2.6L16 25.5l-2.6-6.9L6.5 16l6.9-2.6z" fill="#fff" />
      <circle cx="16" cy="16" r="2.4" fill="#660033" />
    </svg>
  );
}

// Nom de marque écrit comme sur superhosts.ma : "superhosts" en gras serré, ".ma" plus petit en
// bordeaux (text-primary : bordeaux en clair, rose bordeaux en sombre pour rester lisible).
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-[-0.03em]", className)}>
      superhosts<span className="text-[0.82em] text-primary">.ma</span>
    </span>
  );
}
