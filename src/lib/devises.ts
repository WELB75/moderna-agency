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


// Devises proposées pour une réservation (Kamel, 2026-11-04 : "il me faut le choix de devise
// euros, dirhams, dollars, livre sterling"). Les tarifs des options sont définis en euros ; pour une
// autre devise on les convertit au taux du jour (même API que le dirham), arrondis à un montant lisible.
export const DEVISES_RESERVATION = [
  { code: "EUR", label: "Euros (€)" },
  { code: "MAD", label: "Dirhams (MAD)" },
  { code: "USD", label: "Dollars ($)" },
  { code: "GBP", label: "Livres sterling (£)" },
] as const;

// Taux de secours (pour 1 euro) si l'API ne répond pas.
const TAUX_SECOURS: Record<string, number> = { USD: 1.15, GBP: 0.87 };

export function codeDevise(devise: string | null | undefined): string {
  const code = (devise ?? "").trim().toUpperCase();
  if (estDirham(code)) return "MAD";
  return code || "EUR";
}

// Convertit un tarif défini en euros vers la devise voulue, arrondi : 5 près en dirhams, à l'unité sinon.
export async function tarifEnDevise(montantEur: number, devise: string | null | undefined): Promise<number> {
  const code = codeDevise(devise);
  if (code === "EUR") return montantEur;
  let taux: number | undefined;
  if (code === "MAD") {
    taux = await getMadParEur();
  } else {
    try {
      const res = await fetch(URL_TAUX, { next: { revalidate: 12 * 60 * 60 }, signal: AbortSignal.timeout(4000) });
      const body = res.ok ? ((await res.json()) as { rates?: Record<string, number> }) : null;
      const t = body?.rates?.[code];
      if (typeof t === "number" && Number.isFinite(t) && t > 0) taux = t;
    } catch {
      // taux de secours ci-dessous
    }
    taux ??= TAUX_SECOURS[code];
  }
  if (!taux) return montantEur;
  const brut = montantEur * taux;
  return code === "MAD" ? Math.round(brut / 5) * 5 : Math.round(brut);
}
