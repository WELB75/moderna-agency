// Texte collé depuis un devis ou un message WhatsApp (« **Prix par nuitée : 5000dh/jour** », lignes
// « --- », puces « • ») : on retire la mise en forme markdown et on met les lignes bout à bout, pour
// qu'il se lise proprement dans une petite carte au lieu d'afficher les astérisques.
export function nettoyerTexteCollé(texte: string): string {
  return texte
    .split(/\r?\n/)
    .map((ligne) =>
      ligne
        .replace(/\*\*|__/g, "")
        .replace(/^\s*(?:[•·*\-–]|\d+[.)])\s+/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((ligne) => ligne !== "" && !/^[-–—_=*\s]{3,}$/.test(ligne))
    .join(" · ");
}
