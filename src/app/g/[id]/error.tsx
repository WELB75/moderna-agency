"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

// Filet de sécurité de la fiche police côté voyageur. En production, une erreur non rattrapée
// (serveur qui ne répond pas à froid, coupure réseau en 4G, base endormie) laissait une page
// blanche sans rien à cliquer — le voyageur ne pouvait que deviner qu'il fallait rafraîchir
// (Fouad, 2026-10-31). Ici : on réessaie une fois tout seul après 2 s (le plus souvent le serveur
// est réveillé entre-temps), puis un bouton « Réessayer » bilingue si ça ne suffit pas.
export default function ErreurFichePolice({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    console.error("Fiche police (voyageur) :", error);
    if (tentative > 0) return;
    const t = setTimeout(() => {
      setTentative(1);
      reset();
    }, 2000);
    return () => clearTimeout(t);
  }, [error, reset, tentative]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo size={56} />
      {tentative === 0 ? (
        <>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Un instant, nouvelle tentative… / One moment, retrying…</p>
        </>
      ) : (
        <>
          <p className="font-medium">Le serveur met un peu de temps à répondre.</p>
          <p className="text-sm text-muted-foreground">The server is taking a moment to respond.</p>
          <Button type="button" className="h-12 w-full max-w-xs text-base" onClick={() => window.location.reload()}>
            Réessayer / Retry
          </Button>
          <p className="text-xs text-muted-foreground">Ce qui a déjà été enregistré est conservé. / Anything already saved is kept.</p>
        </>
      )}
    </div>
  );
}
