// Conversion dirhams → euros. Toute l'app affiche les loyers et les prix en euros ; seule Villa
// Wimiliim a une annonce Airbnb tarifée en dirhams (PriceLabs en MAD), dont les montants
// arrivaient tels quels avec un "€" collé dessus (ex. 6216 MAD affichés "6216,00 €").
// Fouad, 2026-10-15 : "la villa Wimiliim faut bien qu'elle soit en euros comme les autres partout".
//
// Taux du jour (ExchangeRate-API, sans clé, mis à jour quotidiennement), gardé en mémoire 12h.
// MAD_PAR_EUR dans l'environnement force un taux fixe ; si l'API ne répond pas, on retombe sur
// MAD_PAR_EUR_SECOURS (≈ taux d'octobre 2026) plutôt que de bloquer l'affichage.

export const MAD_PAR_EUR_SECOURS = 11;

const URL_TAUX = "https://open.er-api.com/v6/latest/EUR";
const DUREE_CACHE_MS = 12 * 60 * 60 * 1000;
const DUREE_CACHE_ECHEC_MS = 10 * 60 * 1000;

let cacheTaux: { valeur: number; expire: number } | null = null;

export function estDirham(devise: string | null | undefined): boolean {
  const code = (devise ?? "").trim().toUpperCase();
  return code === "MAD" || code === "DH" || code === "DHS";
}

function tauxPlausible(taux: unknown): taux is number {
  return typeof taux === "number" && Number.isFinite(taux) && taux > 5 && taux < 20;
}

// Nombre de dirhams pour 1 euro (≈ 11).
export async function getMadParEur(): Promise<number> {
  const force = Number(process.env.MAD_PAR_EUR);
  if (tauxPlausible(force)) return force;
  if (cacheTaux && cacheTaux.expire > Date.now()) return cacheTaux.valeur;

  try {
    const res = await fetch(URL_TAUX, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
      const taux = body.rates?.MAD;
      if (body.result === "success" && tauxPlausible(taux)) {
        cacheTaux = { valeur: taux, expire: Date.now() + DUREE_CACHE_MS };
        return taux;
      }
    }
    console.error("[devises] taux MAD/EUR illisible, taux de secours utilisé");
  } catch (err) {
    console.error("[devises] taux MAD/EUR indisponible, taux de secours utilisé :", err instanceof Error ? err.message : err);
  }
  // Pas de nouvel appel à chaque rendu tant que l'API est en panne.
  cacheTaux = { valeur: MAD_PAR_EUR_SECOURS, expire: Date.now() + DUREE_CACHE_ECHEC_MS };
  return MAD_PAR_EUR_SECOURS;
}

export function madVersEur(montant: number, madParEur: number): number {
  return Math.round((montant / madParEur) * 100) / 100;
}
