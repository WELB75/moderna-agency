import NextLink from "next/link";
import type { ComponentProps } from "react";

// `next/link` sans préchargement automatique, utilisé par les menus (sidebar-nav, bottom-nav).
// Par défaut, chaque lien visible à l'écran précharge sa page dès qu'il apparaît : avec un menu
// de 20 entrées sur chaque page (toutes dynamiques,
// rendues à la demande), ouvrir n'importe quel écran déclenchait une vingtaine de requêtes
// serveur en rafale — visibles en 503 par moments, et comptées comme autant d'exécutions de
// fonctions sur l'offre gratuite de Vercel. Comme aucune page n'est statique, ce préchargement
// n'apportait presque rien (il ne ramène que la coquille, pas les données). Les pages s'ouvrent
// donc au clic, avec un écran d'attente immédiat (voir app/(app)/loading.tsx).
//
// Un lien qui mérite vraiment d'être préchargé peut toujours le demander : <Link prefetch />.
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
