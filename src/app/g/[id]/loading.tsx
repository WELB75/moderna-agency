import { Logo } from "@/components/app/logo";

// Écran d'attente de la fiche police côté voyageur. Sans lui, pendant que le serveur se réveille
// (fonction Vercel à froid + base Neon endormie, parfois plusieurs secondes), le navigateur intégré
// de WhatsApp affichait une page entièrement blanche : une cliente a cru que le lien était cassé
// (Fouad, 2026-10-31 : « faut pas déranger le client »). Le logo et un message s'affichent tout de
// suite, le formulaire arrive dès que le serveur répond.
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center" aria-busy="true">
      <Logo size={56} />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Chargement de votre fiche… / Loading your form…</p>
    </div>
  );
}
