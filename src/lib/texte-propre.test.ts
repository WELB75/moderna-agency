import { test } from "node:test";
import assert from "node:assert/strict";
import { nettoyerTexteCollé } from "./texte-propre.ts";

test("devis collé : plus d'astérisques ni de séparateurs, lignes mises bout à bout", () => {
  const brut = "**Voici un devis détaillé pour la Villa Lila.**\n**Dates du séjour :**\nDu 06 au 08 novembre 2026 (2 nuits)\n* Prix par nuitée : **5000dh/jour**\n* **Total séjour : 10 000 dh**\n---\n• **Ménage de fin de séjour :** **800dh**\n**Total final : 10 800 dh**";
  assert.equal(
    nettoyerTexteCollé(brut),
    "Voici un devis détaillé pour la Villa Lila. · Dates du séjour : · Du 06 au 08 novembre 2026 (2 nuits) · Prix par nuitée : 5000dh/jour · Total séjour : 10 000 dh · Ménage de fin de séjour : 800dh · Total final : 10 800 dh"
  );
});

test("texte simple inchangé, vide reste vide", () => {
  assert.equal(nettoyerTexteCollé("Virement reçu le 3 nov."), "Virement reçu le 3 nov.");
  assert.equal(nettoyerTexteCollé("  \n "), "");
});
