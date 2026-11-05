// Conversion dirhams → euros. Toute l'app affiche les loyers et les prix en euros ; seule Villa
// Wimiliim a une annonce Airbnb tarifée en dirhams (PriceLabs en MAD), dont les montants
// arrivaient tels quels avec un "€" collé dessus (ex. 6216 MAD affichés "6216,00 €").
// Fouad, 2026-10-15 : "la villa Wimiliim faut bien qu'elle soit en euros comme les autres partout".
//
// Taux dirham/euro FIXE à 10 (Kamel, 2026-11-05 : "30 euros, c'est 300 dirhams", pas le taux du
// jour ≈ 11). Il s'applique à toutes les conversions de l'app (tarifs des options, rapports de
// caisse, statistiques). Les dollars et les livres, eux, suivent toujours le taux du jour.

export const MAD_PAR_EUR_FIXE = 10;

const URL_TAUX = "https://open.er-api.com/v6/latest/EUR";
export function estDirham(devise: string | null | undefined): boolean {
  const code = (devise ?? "").trim().toUpperCase();
  return code === "MAD" || code === "DH" || code === "DHS";
}

// Nombre de dirhams pour 1 euro : toujours 10.
export async function getMadParEur(): Promise<number> {
  return MAD_PAR_EUR_FIXE;
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

// Nombre d'unités de la devise pour 1 euro : 1 pour l'euro, 10 pour le dirham (fixe), taux du jour
// pour les dollars et les livres (taux de secours si l'API ne répond pas).
export async function tauxPourUnEuro(devise: string | null | undefined): Promise<number | null> {
  const code = codeDevise(devise);
  if (code === "EUR") return 1;
  if (code === "MAD") return getMadParEur();
  try {
    const res = await fetch(URL_TAUX, { next: { revalidate: 12 * 60 * 60 }, signal: AbortSignal.timeout(4000) });
    const body = res.ok ? ((await res.json()) as { rates?: Record<string, number> }) : null;
    const t = body?.rates?.[code];
    if (typeof t === "number" && Number.isFinite(t) && t > 0) return t;
  } catch {
    // taux de secours ci-dessous
  }
  return TAUX_SECOURS[code] ?? null;
}

// Convertit un montant d'une devise à une autre en passant par l'euro (30 € = 300 MAD), à deux
// décimales. Devise inconnue : montant inchangé.
export async function convertirMontant(montant: number, de: string | null | undefined, vers: string | null | undefined): Promise<number> {
  if (codeDevise(de) === codeDevise(vers)) return montant;
  const [tauxDe, tauxVers] = await Promise.all([tauxPourUnEuro(de), tauxPourUnEuro(vers)]);
  if (!tauxDe || !tauxVers) return montant;
  return Math.round((montant / tauxDe) * tauxVers * 100) / 100;
}

// Convertit un tarif défini en euros vers la devise voulue, arrondi : 5 près en dirhams, à l'unité sinon.
export async function tarifEnDevise(montantEur: number, devise: string | null | undefined): Promise<number> {
  const code = codeDevise(devise);
  if (code === "EUR") return montantEur;
  const taux = await tauxPourUnEuro(code);
  if (!taux) return montantEur;
  const brut = montantEur * taux;
  return code === "MAD" ? Math.round(brut / 5) * 5 : Math.round(brut);
}
