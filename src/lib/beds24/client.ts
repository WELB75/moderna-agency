// Client pour l'API Beds24 v2 (https://api.beds24.com/v2), testé contre une propriété
// bac à sable ("Villa Moderna", propertyId 345023) avant tout branchement sur une vraie villa.
// La v1 (API Key + propKey) est dépréciée par Beds24 et n'est plus utilisée ici.
//
// Authentification : un refresh token permanent (BEDS24_REFRESH_TOKEN, obtenu une fois via
// Settings > Marketplace > API > Generate invite code, puis échangé contre ce refresh token)
// sert à générer des jetons d'accès de 24h à la volée, mis en cache en mémoire.

const BASE_URL = "https://api.beds24.com/v2";

export class Beds24ConfigError extends Error {}
export class Beds24ApiError extends Error {}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;
  if (!refreshToken) throw new Beds24ConfigError("BEDS24_REFRESH_TOKEN manquant dans l'environnement.");

  const res = await fetch(`${BASE_URL}/authentication/token`, {
    method: "GET",
    headers: { refreshToken },
  });
  const body = (await res.json()) as { token?: string; expiresIn?: number; error?: string };
  if (!res.ok || !body.token) {
    throw new Beds24ApiError(`Échec du rafraîchissement du token Beds24 : ${JSON.stringify(body)}`);
  }

  // Marge de 5 minutes avant l'expiration réelle pour ne jamais utiliser un jeton périmé.
  cachedToken = { value: body.token, expiresAt: Date.now() + ((body.expiresIn ?? 86400) - 300) * 1000 };
  return cachedToken.value;
}

async function beds24Fetch<T>(path: string, options: { method?: string; query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { token, "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = (await res.json()) as unknown;
  if (!res.ok || (body && typeof body === "object" && "success" in body && (body as { success: boolean }).success === false)) {
    throw new Beds24ApiError(`Beds24 ${options.method ?? "GET"} ${path} a échoué : ${JSON.stringify(body)}`);
  }
  return body as T;
}

export type Beds24Property = {
  id: number;
  name: string;
  propertyType: string;
  currency: string;
};

export async function beds24GetProperties(): Promise<Beds24Property[]> {
  const res = await beds24Fetch<{ data: Beds24Property[] }>("/properties");
  return res.data;
}

export type Beds24BookingStatus = "new" | "request" | "confirmed" | "cancelled" | "black" | "inquiry";

export type Beds24Booking = {
  id: number;
  propertyId: number;
  roomId: number;
  status: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
  numAdult: number;
  numChild: number;
  firstName: string;
  lastName: string;
  email: string;
  price: number;
  channel?: string; // ex. "direct", "airbnb", "bookingcom"
};

export async function beds24GetBookings(filters: {
  propertyId?: number;
  roomId?: number;
  arrivalFrom?: string;
  arrivalTo?: string;
  status?: Beds24BookingStatus;
  modifiedFrom?: string;
} = {}): Promise<Beds24Booking[]> {
  const res = await beds24Fetch<{ data: Beds24Booking[] }>("/bookings", { query: filters });
  return res.data;
}

export type Beds24BookingWrite = {
  id?: number; // fourni = modification, absent = création
  roomId: number;
  status: Beds24BookingStatus;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD, date de départ réelle (pas la dernière nuit)
  firstName?: string;
  lastName?: string;
  email?: string;
  numAdult?: number;
};

export type Beds24BookingWriteResult = { success: boolean; id?: number; warnings?: string[] };

export async function beds24WriteBookings(bookings: Beds24BookingWrite[]): Promise<Beds24BookingWriteResult[]> {
  return beds24Fetch<Beds24BookingWriteResult[]>("/bookings", { method: "POST", body: bookings });
}

export type Beds24CalendarWrite = {
  roomId: number;
  calendar: { from: string; to: string; numAvail?: number; price1?: number; minStay?: number }[];
};

// ATTENTION : price1 et minStay ont été vérifiés fonctionnels (écriture + relecture confirmées
// contre la propriété test). numAvail est accepté sans erreur (success: true) mais n'a, dans nos
// tests, jamais changé le statut ouvert/fermé réel d'une date — probablement un réglage par
// défaut de la propriété test (jamais "ouverte" manuellement dans Beds24) plutôt qu'un bug ici,
// mais à revérifier avant de compter dessus pour la disponibilité en production.
export async function beds24UpdateCalendar(updates: Beds24CalendarWrite[]): Promise<unknown> {
  return beds24Fetch("/inventory/rooms/calendar", { method: "POST", body: updates });
}

export type Beds24CalendarDay = {
  roomId: number;
  date: string;
  numAvail: number;
  price1: number;
  minStay: number;
};

export async function beds24GetCalendar(roomId: number, startDate: string, endDate: string): Promise<Beds24CalendarDay[]> {
  const res = await beds24Fetch<{ data: Beds24CalendarDay[] }>("/inventory/rooms/calendar", {
    query: { roomId, startDate, endDate, includePrices: true, includeNumAvail: true },
  });
  return res.data;
}
