/**
 * Connecteur Superhote.
 *
 * La documentation publique de Superhote (help.superhote.com) ne décrit que les
 * endpoints "create-booking" / "get-availabilities" (pousser une réservation
 * vers Superhote), pas d'endpoint pour lister les réservations existantes.
 * L'endpoint ci-dessous (SUPERHOTE_BOOKINGS_PATH) est donc configurable par env
 * var : à confirmer/ajuster avec la doc réelle fournie par le support Superhote
 * ou la section "API" du compte Superhote une fois disponible.
 */

const BASE_URL = process.env.SUPERHOTE_API_BASE_URL ?? "https://app.superhote.com/api/v2";
const BOOKINGS_PATH = process.env.SUPERHOTE_BOOKINGS_PATH ?? "/get-bookings";

export type SuperhoteBooking = {
  id: string;
  property_key: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  checking: string; // ISO date
  checkout: string; // ISO date
  nbr_adults?: number;
  nbr_children?: number;
  status?: string;
};

export class SuperhoteConfigError extends Error {}
export class SuperhoteApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getApiKey() {
  const key = process.env.SUPERHOTE_API_KEY;
  if (!key) throw new SuperhoteConfigError("SUPERHOTE_API_KEY n'est pas configurée.");
  return key;
}

/**
 * Récupère les réservations Superhote sur une plage de dates.
 * propertyKey optionnel : certains comptes Superhote gèrent plusieurs
 * "property_key" (une par villa) — à confirmer selon la structure du compte.
 */
export async function fetchSuperhoteBookings(params: {
  startDate: string;
  endDate: string;
  propertyKey?: string;
}): Promise<SuperhoteBooking[]> {
  const apiKey = getApiKey();

  const res = await fetch(`${BASE_URL}${BOOKINGS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      property_key: params.propertyKey,
      start_date: params.startDate,
      end_date: params.endDate,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SuperhoteApiError(
      `Superhote a répondu ${res.status} sur ${BOOKINGS_PATH}. Vérifie l'endpoint exact avec le support Superhote. Réponse: ${body.slice(0, 300)}`,
      res.status
    );
  }

  const data = await res.json();
  const bookings = Array.isArray(data) ? data : (data.bookings ?? data.data ?? []);
  return bookings as SuperhoteBooking[];
}

export function isSuperhoteConfigured() {
  return Boolean(process.env.SUPERHOTE_API_KEY);
}
