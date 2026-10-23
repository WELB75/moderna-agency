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
  push_enabled?: boolean; // synchronisation des prix active vers le PMS (Beds24, Airbnb...)
};

export async function pricelabsGetListings(): Promise<PricelabsListing[]> {
  const res = await pricelabsFetch<{ listings: PricelabsListing[] }>("/listings");
  return res.listings ?? [];
}

export type PricelabsDailyPrice = {
  date: string; // YYYY-MM-DD
  price: number | null;
  unbookable: 0 | 1;
  // Séjour minimum que PriceLabs calcule pour une arrivée ce jour-là (profil "Min 2 nuits",
  // règle des nuits orphelines, dérogations par date...) et qu'il pousse vers Beds24.
  min_stay?: number | null;
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

// Recalcul immédiat des prix d'une annonce (équivalent du "Save & Refresh" de l'application
// PriceLabs). Doc : POST /v1/refresh_listing — 3 appels par annonce et par 24 h, 10 par minute
// pour le compte. Utilisé quand /listing_prices répond "Listing data does not exist in PriceLabs"
// pour une annonce pourtant présente dans /listings : c'est le cas d'une annonce dont PriceLabs
// n'a pas encore recalculé le calendrier du jour (vu le 2026-10-23 sur 6 logements d'un coup ;
// ouvrir l'annonce dans PriceLabs, qui déclenche ce même recalcul, suffisait à débloquer).
export type PricelabsRefreshDay = { date: string; price?: string | number; min_stay?: string | number } & Record<string, unknown>;

export async function pricelabsRefreshListing(listingId: string, pms: string): Promise<PricelabsRefreshDay[]> {
  const res = await pricelabsFetch<{ pricing_array?: PricelabsRefreshDay[] }>("/refresh_listing", {
    method: "POST",
    body: { listing_id: listingId, pms },
  });
  return res.pricing_array ?? [];
}

// Dérogations par date ("Date Specific Overrides", DSO) d'une annonce — utilisées pour fixer le
// nombre de nuits minimum d'une date depuis l'app (panneau "Nombre de nuits minimum" de la vue
// planning). Sans ça, une valeur écrite seulement dans Beds24 serait écrasée par PriceLabs à sa
// prochaine synchro (même avertissement que SuperHote : "PriceLabs risque d'écraser votre
// saisie"). Doc : POST/GET /v1/listings/:listing_id/overrides.
export type PricelabsOverride = {
  date: string; // YYYY-MM-DD
  price?: string;
  price_type?: "fixed" | "percent" | "percent_stacked";
  currency?: string;
  min_stay?: number;
  min_price?: number;
  min_price_type?: "fixed" | "percent_base" | "percent_min";
  max_price?: number;
  max_price_type?: "fixed" | "percent_base" | "percent_max";
  base_price?: number;
  check_in_check_out_enabled?: "0" | "1";
  check_in?: string;
  check_out?: string;
  reason?: string;
  lead_time_expiry?: number;
};

// Champs renvoyés en lecture mais refusés/inutiles en écriture.
const CHAMPS_LECTURE_SEULE = ["created_at", "updated_at"] as const;

export async function pricelabsGetOverrides(listingId: string, pms: string, startDate: string, endDate: string): Promise<PricelabsOverride[]> {
  const query = new URLSearchParams({ pms, start_date: startDate, end_date: endDate });
  const res = await pricelabsFetch<{ overrides?: (PricelabsOverride & Record<string, unknown>)[] }>(
    `/listings/${encodeURIComponent(listingId)}/overrides?${query.toString()}`
  );
  return (res.overrides ?? []).map((o) => {
    const copie: Record<string, unknown> = { ...o };
    for (const champ of CHAMPS_LECTURE_SEULE) delete copie[champ];
    // Valeurs vides renvoyées par l'API ("" ou null) : on ne les renvoie pas en écriture, sinon
    // la validation PriceLabs refuse toute la requête.
    for (const [cle, valeur] of Object.entries(copie)) if (valeur === null || valeur === "") delete copie[cle];
    return copie as PricelabsOverride;
  });
}

// Ajoute ou met à jour des dérogations. Toute la requête est refusée (400) si une seule ligne est
// invalide : rien n'est alors enregistré.
export async function pricelabsUpsertOverrides(listingId: string, pms: string, overrides: PricelabsOverride[]): Promise<PricelabsOverride[]> {
  if (overrides.length === 0) return [];
  const res = await pricelabsFetch<{ overrides?: PricelabsOverride[] }>(`/listings/${encodeURIComponent(listingId)}/overrides`, {
    method: "POST",
    body: { overrides, pms },
  });
  return res.overrides ?? [];
}
