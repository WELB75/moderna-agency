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
  phone?: string;
  mobile?: string;
  price: number;
  channel?: string; // code technique du canal, ex. "airbnb", "booking", "direct"
  referer?: string; // libellé lisible du canal, ex. "Airbnb", "Booking.com", "Direct"
  apiSource?: string;
};

// Réponse paginée de GET /bookings : Beds24 renvoie au plus une page de résultats et indique
// via pages.nextPageExists s'il faut demander la suivante (paramètre "page", à partir de 1).
type Beds24BookingsPage = {
  data: Beds24Booking[];
  count?: number;
  pages?: { nextPageExists?: boolean; nextPageLink?: string | null };
};

export type Beds24BookingFilters = {
  id?: number | number[];
  propertyId?: number | number[];
  roomId?: number | number[];
  arrivalFrom?: string;
  arrivalTo?: string;
  departureFrom?: string; // sans filtre de date, Beds24 ne renvoie que les séjours en cours/à venir
  departureTo?: string;
  status?: Beds24BookingStatus | Beds24BookingStatus[];
  modifiedFrom?: string;
  includeGuests?: boolean;
};

// Garde-fou contre une boucle infinie si l'API renvoyait toujours nextPageExists: true.
const MAX_BOOKING_PAGES = 50;

// Récupère TOUTES les pages de résultats (et non seulement la première, comme avant).
export async function beds24GetBookings(filters: Beds24BookingFilters = {}): Promise<Beds24Booking[]> {
  const all: Beds24Booking[] = [];
  for (let page = 1; page <= MAX_BOOKING_PAGES; page++) {
    const res = await beds24Fetch<Beds24BookingsPage>("/bookings", { query: { ...filters, page } });
    all.push(...(res.data ?? []));
    if (!res.pages?.nextPageExists) return all;
  }
  throw new Beds24ApiError(`Beds24 GET /bookings : plus de ${MAX_BOOKING_PAGES} pages de résultats, synchro interrompue.`);
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

// price1, minStay et numAvail sont tous les trois vérifiés fonctionnels (écriture + relecture
// confirmées contre une vraie propriété connectée à Airbnb, pas juste la propriété test) —
// numAvail:0/1 bloque/débloque un calendrier sans jamais créer de réservation, donc sans aucun
// risque sur le taux d'annulation Airbnb (voir maybeDoc "Kamel, 2026-09-14" plus bas dans le repo
// pour le pourquoi : create-puis-cancel une vraie réservation, elle, DÉCLENCHE la pénalité
// anti-abus d'Airbnb qui verrouille les dates). C'est donc la méthode à privilégier pour tout
// futur test de connexion à un channel (Airbnb, Booking.com...), jamais beds24WriteBookings.
export async function beds24UpdateCalendar(updates: Beds24CalendarWrite[]): Promise<unknown> {
  return beds24Fetch("/inventory/rooms/calendar", { method: "POST", body: updates });
}

export type Beds24Message = {
  id: number;
  bookingId: number;
  time: string; // ISO
  read: boolean;
  message: string;
  source: "guest" | "host" | "channel" | string;
};

// Messages voyageur/hôte rattachés à une réservation OTA (Airbnb, Booking.com...) — Kamel,
// 2026-09-15, après avoir vu les messages Airbnb dans Beds24 : "on peux les intégrer dans notre
// app moderna". Ne fonctionne que pour les réservations venant d'un canal (pas les résas
// "Direct" créées à la main, qui n'ont pas de fil de discussion côté Beds24).
export async function beds24GetMessages(bookingId: number): Promise<Beds24Message[]> {
  const res = await beds24Fetch<{ data: Beds24Message[] }>("/bookings/messages", { query: { bookingId } });
  return res.data;
}

// Kamel, 2026-09-15 : "je veux pouvoir aussi y répondre sur l'app" — l'API précise que l'écriture
// ne fonctionne que pour une réservation venant d'un canal OTA (Airbnb, Booking.com...), jamais
// une résa "Direct" créée à la main (qui n'a pas de fil de discussion côté Beds24).
export async function beds24SendMessage(bookingId: number, message: string): Promise<void> {
  await beds24Fetch("/bookings/messages", { method: "POST", body: [{ bookingId, message }] });
}

// Calendrier d'un logement Beds24, jour par jour : prix envoyé aux canaux (price1, poussé par
// PriceLabs), séjour minimum/maximum et restrictions d'arrivée/départ — affiché sous chaque villa
// dans la vue planning (détails dépliables façon SuperHote v2). Beds24 renvoie des plages
// { from, to } que l'on déplie ici en une ligne par date.
export type Beds24CalendarDay = {
  date: string; // YYYY-MM-DD
  price: number | null;
  minStay: number | null;
  maxStay: number | null;
  numAvail: number | null;
  arriveeBloquee: boolean;
  departBloque: boolean;
};

type Beds24CalendarRange = {
  from: string;
  to: string;
  numAvail?: number;
  minStay?: number;
  maxStay?: number;
  override?: "none" | "blackout" | "exception" | "noCheckIn" | "noCheckOut" | "noCheckInOrCheckOut" | string;
  price1?: number;
};

export async function beds24GetCalendar(roomId: number, startDate: string, endDate: string): Promise<Beds24CalendarDay[]> {
  const res = await beds24Fetch<{ data?: { roomId: number; calendar?: Beds24CalendarRange[] }[] }>("/inventory/rooms/calendar", {
    query: {
      roomId,
      startDate,
      endDate,
      includePrices: true,
      includeNumAvail: true,
      includeMinStay: true,
      includeMaxStay: true,
      includeOverride: true,
    },
  });

  const parDate = new Map<string, Beds24CalendarDay>();
  for (const room of res.data ?? []) {
    if (Number(room.roomId) !== roomId) continue;
    for (const plage of room.calendar ?? []) {
      const override = plage.override ?? "none";
      const fin = plage.to && plage.to >= plage.from ? plage.to : plage.from;
      for (let d = new Date(`${plage.from}T00:00:00Z`); d <= new Date(`${fin}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        const date = d.toISOString().slice(0, 10);
        if (date < startDate || date > endDate) continue;
        parDate.set(date, {
          date,
          price: typeof plage.price1 === "number" ? plage.price1 : null,
          minStay: typeof plage.minStay === "number" ? plage.minStay : null,
          maxStay: typeof plage.maxStay === "number" ? plage.maxStay : null,
          numAvail: typeof plage.numAvail === "number" ? plage.numAvail : null,
          arriveeBloquee: override === "blackout" || override === "noCheckIn" || override === "noCheckInOrCheckOut",
          departBloque: override === "blackout" || override === "noCheckOut" || override === "noCheckInOrCheckOut",
        });
      }
    }
  }
  return [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
