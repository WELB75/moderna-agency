// Client pour la Customer API PriceLabs v1 (https://developers.pricelabs.co/customer-api/).
// N'est appelé que côté serveur (route /api/tarification et lib/pricelabs/sync.ts) : la clé
// PRICELABS_API_KEY ne doit jamais transiter vers le front.

const BASE_URL = "https://api.pricelabs.co/v1";

export class PricelabsConfigError extends Error {}
export class PricelabsApiError extends Error {}

function getApiKey(): string {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) throw new PricelabsConfigError("PRICELABS_API_KEY manquant dans l'environnement.");
  return key;
}

async function pricelabsFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "X-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    // Le corps peut contenir des détails utiles (ex. dépassement de quota) mais jamais la clé
    // API elle-même (envoyée en header, jamais renvoyée par PriceLabs) — donc rien à filtrer ici.
    const body = await res.text();
    throw new PricelabsApiError(`PriceLabs ${options.method ?? "GET"} ${path} a répondu ${res.status} : ${body.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

export type PricelabsListing = {
  id: string;
  pms: string;
  name: string;
  currency?: string;
  min?: number;
  base?: number;
  max?: number;
  isHidden?: boolean;
};

export async function pricelabsGetListings(): Promise<PricelabsListing[]> {
  const res = await pricelabsFetch<{ listings: PricelabsListing[] }>("/listings");
  return res.listings ?? [];
}

export type PricelabsDailyPrice = {
  date: string; // YYYY-MM-DD
  price: number | null;
  unbookable: 0 | 1;
};

export type PricelabsListingPrices = {
  id: string;
  pms: string;
  currency?: string;
  error?: string;
  error_status?: string;
  data: PricelabsDailyPrice[];
};

export async function pricelabsGetPrices(
  listings: { id: string; pms: string }[],
  dateFrom: string,
  dateTo: string
): Promise<PricelabsListingPrices[]> {
  if (listings.length === 0) return [];
  return pricelabsFetch<PricelabsListingPrices[]>("/listing_prices", {
    method: "POST",
    body: { listings: listings.map((l) => ({ ...l, dateFrom, dateTo })) },
  });
}
