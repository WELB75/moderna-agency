"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// `next/link` pour les menus (sidebar-nav, bottom-nav), avec deux réglages pour la fluidité :
//
// 1. Pas de préchargement automatique de toutes les entrées visibles (une vingtaine de requêtes
//    en rafale à chaque page, voir l'historique : 503 par moments et exécutions de fonctions
//    comptées sur l'offre gratuite de Vercel). À la place : préchargement "à l'intention" — dès
//    que le doigt/la souris touche ou survole le lien, juste avant le clic — et uniquement pour
//    le lien concerné. Un lien qui mérite d'être préchargé d'office peut toujours le demander :
//    <Link prefetch />.
//
// 2. Retour visuel immédiat : dès le toucher, le lien porte data-pending="true" jusqu'à l'arrivée
//    sur la nouvelle page. Les menus s'en servent pour allumer l'entrée tout de suite, sans
//    attendre la réponse du serveur — c'est ce qui donnait l'impression d'un clic "mou".
export default function Link({
  prefetch = false,
  onClick,
  onPointerEnter,
  onTouchStart,
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  const pathname = usePathname();
  const prechargé = useRef(false);
  const [cliqueDepuis, setCliqueDepuis] = useState<string | null>(null);
  const cible = typeof href === "string" ? href : (href.pathname ?? "");
  const interne = cible.startsWith("/");

  // Sécurité : si la navigation n'aboutit pas (même page, erreur), l'état "en cours" retombe.
  useEffect(() => {
    if (cliqueDepuis === null) return;
    const t = setTimeout(() => setCliqueDepuis(null), 5000);
    return () => clearTimeout(t);
  }, [cliqueDepuis]);

  const precharger = () => {
    if (prefetch || prechargé.current || !interne) return;
    prechargé.current = true;
    try {
      router.prefetch(typeof href === "string" ? href : String(href.pathname ?? ""));
    } catch {
      // le préchargement n'est qu'un confort
    }
  };

  return (
    <NextLink
      {...props}
      href={href}
      prefetch={prefetch}
      data-pending={cliqueDepuis !== null && cliqueDepuis === pathname ? "true" : undefined}
      onPointerEnter={(e) => {
        precharger();
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        precharger();
        onTouchStart?.(e);
      }}
      onClick={(e) => {
        if (interne && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
          setCliqueDepuis(pathname);
        }
        onClick?.(e);
      }}
    />
  );
}
