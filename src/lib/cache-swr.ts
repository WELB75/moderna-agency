import { after } from "next/server";

// Cache mémoire "périmé mais servi tout de suite" pour les appels externes lents (Beds24...).
//
// - Frais (< ttlMs) : renvoyé tel quel, aucun appel.
// - Périmé mais pas trop vieux (< perimeMs) : renvoyé IMMÉDIATEMENT, et rafraîchi en arrière-plan
//   après l'envoi de la réponse (after) — l'écran s'ouvre sans attendre le fournisseur.
// - Absent ou trop vieux : on attend l'appel (premier chargement de l'instance).
// Les appels simultanés à la même clé partagent une seule requête.
//
// Mémoire d'instance (serverless) : une instance froide repart de zéro, c'est voulu — ça reste un
// gain net pour toutes les ouvertures suivantes de la même instance, sans nouvelle dépendance.
type Entree<T> = { valeur: T; at: number };

const magasin = new Map<string, Entree<unknown>>();
const enCours = new Map<string, Promise<unknown>>();

function lancer<T>(cle: string, chargeur: () => Promise<T>): Promise<T> {
  const deja = enCours.get(cle) as Promise<T> | undefined;
  if (deja) return deja;
  const p = chargeur()
    .then((valeur) => {
      magasin.set(cle, { valeur, at: Date.now() });
      return valeur;
    })
    .finally(() => enCours.delete(cle));
  enCours.set(cle, p);
  return p;
}

export async function avecCacheSwr<T>(
  cle: string,
  { ttlMs, perimeMs }: { ttlMs: number; perimeMs: number },
  chargeur: () => Promise<T>
): Promise<T> {
  const e = magasin.get(cle) as Entree<T> | undefined;
  const age = e ? Date.now() - e.at : Infinity;
  if (e && age < ttlMs) return e.valeur;
  if (e && age < perimeMs) {
    const rafraichir = () => lancer(cle, chargeur).then(() => undefined, () => undefined);
    try {
      after(rafraichir);
    } catch {
      void rafraichir(); // hors requête (script, test)
    }
    return e.valeur;
  }
  return lancer(cle, chargeur);
}

// À appeler après une écriture (envoi d'un message, lecture...) pour que la prochaine ouverture
// relise la source. Sans préfixe : vide tout.
export function viderCacheSwr(prefixe?: string) {
  for (const k of [...magasin.keys()]) if (!prefixe || k.startsWith(prefixe)) magasin.delete(k);
}
