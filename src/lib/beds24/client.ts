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
  apiReference?: string; // référence du canal, ex. code de confirmation Airbnb (HM...) ou numéro Booking.com
  bookingTime?: string; // ISO, date de création de la réservation / demande
  modifiedTime?: string; // ISO
  infoItems?: Beds24InfoItem[]; // renvoyés seulement avec includeInfoItems: true
};

// "Booking info items" Beds24 : couples code/texte attachés à une réservation, lisibles dans
// les messages automatiques via [BOOKINGINFOCODETEXT:CODE] (voir lien fiche police, sync.ts).
export type Beds24InfoItem = { id?: number; code: string; text: string };

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
  includeInfoItems?: boolean;
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

// Ajoute des info items à des réservations existantes (POST /bookings avec seulement id +
// infoItems : Beds24 n'ajoute que l'élément, sans toucher au reste de la réservation).
export async function beds24AddInfoItems(items: { id: number; infoItems: Beds24InfoItem[] }[]): Promise<Beds24BookingWriteResult[]> {
  if (items.length === 0) return [];
  return beds24Fetch<Beds24BookingWriteResult[]>("/bookings", { method: "POST", body: items });
}

export async function beds24WriteBookings(bookings: Beds24BookingWrite[]): Promise<Beds24BookingWriteResult[]> {
  invaliderCalendriersParc();
  return beds24Fetch<Beds24BookingWriteResult[]>("/bookings", { method: "POST", body: bookings });
}

export type Beds24CalendarWrite = {
  roomId: number;
  calendar: {
    from: string;
    to: string;
    numAvail?: number;
    price1?: number;
    minStay?: number;
    // "Remplacer" dans le calendrier Beds24. "blackout" ferme la date sur tous les canaux ;
    // "none" lève la fermeture (spec API v2 : sans numAvail, numAvail repasse au maximum possible).
    override?: "none" | "blackout" | "exception" | "noCheckIn" | "noCheckOut" | "noCheckInOrCheckOut";
  }[];
};

// price1, minStay et numAvail sont tous les trois vérifiés fonctionnels (écriture + relecture
// confirmées contre une vraie propriété connectée à Airbnb, pas juste la propriété test) —
// numAvail:0/1 bloque/débloque un calendrier sans jamais créer de réservation, donc sans aucun
// risque sur le taux d'annulation Airbnb (voir maybeDoc "Kamel, 2026-09-14" plus bas dans le repo
// pour le pourquoi : create-puis-cancel une vraie réservation, elle, DÉCLENCHE la pénalité
// anti-abus d'Airbnb qui verrouille les dates). C'est donc la méthode à privilégier pour tout
// futur test de connexion à un channel (Airbnb, Booking.com...), jamais beds24WriteBookings.
export async function beds24UpdateCalendar(updates: Beds24CalendarWrite[]): Promise<unknown> {
  invaliderCalendriersParc();
  return beds24Fetch("/inventory/rooms/calendar", { method: "POST", body: updates });
}

// Beds24 répond 200 même quand il refuse une partie de l'écriture : la réponse est une liste (un
// élément par logement) avec success/errors/warnings. Renvoie le texte des refus et avertissements
// (null si tout est accepté), pour l'afficher au lieu d'un simple "non confirmé".
export function beds24AlertesEcriture(reponse: unknown): string | null {
  const elements = Array.isArray(reponse) ? reponse : reponse && typeof reponse === "object" ? [reponse] : [];
  const messages: string[] = [];
  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const e = el as { success?: boolean; errors?: unknown; warnings?: unknown; error?: unknown };
    for (const champ of [e.errors, e.warnings, e.error]) {
      if (champ == null) continue;
      const liste = Array.isArray(champ) ? champ : [champ];
      for (const m of liste) messages.push(typeof m === "string" ? m : JSON.stringify(m));
    }
    if (e.success === false && messages.length === 0) messages.push(JSON.stringify(el));
  }
  return messages.length > 0 ? messages.join(" ; ").slice(0, 400) : null;
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

// Messages de PLUSIEURS réservations en quelques appels (bookingId accepte une liste, cf.
// apiV2.yaml), au lieu d'un appel par réservation. La boîte de réception faisait jusqu'à ~65
// appels par affichage, ce qui épuisait le quota Beds24 sur 5 minutes : des fils (dont les
// demandes d'information) disparaissaient alors au hasard — Fouad, 2026-10-13 : "16
// conversations Airbnb / Booking.com non chargées".
const MESSAGES_IDS_PAR_APPEL = 50;
const MAX_MESSAGE_PAGES = 20;

export async function beds24GetMessagesBulk(bookingIds: number[], maxAge?: number): Promise<Map<number, Beds24Message[]>> {
  const parResa = new Map<number, Beds24Message[]>();
  const ids = [...new Set(bookingIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (const id of ids) parResa.set(id, []);

  for (let i = 0; i < ids.length; i += MESSAGES_IDS_PAR_APPEL) {
    const lot = ids.slice(i, i + MESSAGES_IDS_PAR_APPEL);
    for (let page = 1; page <= MAX_MESSAGE_PAGES; page++) {
      const res = await beds24Fetch<{ data?: Beds24Message[]; pages?: { nextPageExists?: boolean } }>("/bookings/messages", {
        query: { bookingId: lot, maxAge, page },
      });
      for (const m of res.data ?? []) parResa.get(Number(m.bookingId))?.push(m);
      if (!res.pages?.nextPageExists) break;
    }
  }
  return parResa;
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
  // Valeur brute de la case "Remplacer" ("none", "blackout", "noCheckIn"...) : distingue une
  // fermeture complète (blackout) d'une simple interdiction d'arrivée/départ, pour la détection
  // des nuits isolées (voir lib/beds24/nuits-isolees.ts).
  override: string;
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
  return (await beds24GetCalendars([roomId], startDate, endDate)).get(roomId) ?? [];
}

// --- Cache mémoire des calendriers de tout le parc (lecture seule, planning).
//
// Ouvrir la vue planning lisait Beds24 trois fois (18 mois × 16 logements, par tranches de 180
// jours) pour le bandeau "Nuits isolées", puis une fois de plus par logement déplié — à chaque
// ouverture de page, par chaque membre de l'équipe. Beds24 compte ces appels (crédits par 5 min)
// et chaque lecture coûte du temps serveur sur Vercel. On garde donc la dernière lecture du parc
// quelques minutes : le bandeau et les lignes de détail (/api/beds24/calendrier) s'y servent. Les
// chemins qui écrivent ou vérifient après écriture (fermeture de dates, nuits minimum,
// disponibilité avant réservation) n'y touchent pas et relisent toujours Beds24 en direct ; toute
// écriture via ce client vide le cache.
const DUREE_CACHE_PARC_MS = 5 * 60 * 1000;
type CacheParc = { expire: number; debut: string; fin: string; parRoom: Map<number, Beds24CalendarDay[]> };
let cacheParc: CacheParc | null = null;
let lectureParcEnCours: { cle: string; promesse: Promise<Map<number, Beds24CalendarDay[]>> } | null = null;

export function invaliderCalendriersParc(): void {
  cacheParc = null;
}

// Calendriers de plusieurs logements sur une période, depuis le cache s'il couvre la demande,
// sinon lus dans Beds24 (par tranches de `trancheJours`, limite de l'API) puis mis en cache. Deux
// ouvertures simultanées partagent la même lecture.
export async function beds24GetCalendarsParc(roomIds: number[], debut: string, fin: string, trancheJours = 180): Promise<Map<number, Beds24CalendarDay[]>> {
  const ids = [...new Set(roomIds.filter((id) => Number.isInteger(id) && id > 0))];
  const enCache = calendriersParcDepuisCache(ids, debut, fin);
  if (enCache) return enCache;

  const cle = `${ids.join(",")}|${debut}|${fin}`;
  if (lectureParcEnCours?.cle === cle) return lectureParcEnCours.promesse;
  const promesse = (async () => {
    const parRoom = new Map<number, Beds24CalendarDay[]>(ids.map((id) => [id, []]));
    for (let d = debut; d <= fin; d = ajouterJoursISO(d, trancheJours)) {
      const finTranche = ajouterJoursISO(d, trancheJours - 1) < fin ? ajouterJoursISO(d, trancheJours - 1) : fin;
      const tranche = await beds24GetCalendars(ids, d, finTranche);
      for (const [id, jours] of tranche) parRoom.get(id)?.push(...jours);
    }
    cacheParc = { expire: Date.now() + DUREE_CACHE_PARC_MS, debut, fin, parRoom };
    return parRoom;
  })().finally(() => {
    if (lectureParcEnCours?.cle === cle) lectureParcEnCours = null;
  });
  lectureParcEnCours = { cle, promesse };
  return promesse;
}

function calendriersParcDepuisCache(ids: number[], debut: string, fin: string): Map<number, Beds24CalendarDay[]> | null {
  if (!cacheParc || cacheParc.expire < Date.now()) return null;
  if (debut < cacheParc.debut || fin > cacheParc.fin) return null;
  if (!ids.every((id) => cacheParc!.parRoom.has(id))) return null;
  const out = new Map<number, Beds24CalendarDay[]>();
  for (const id of ids) out.set(id, (cacheParc.parRoom.get(id) ?? []).filter((j) => j.date >= debut && j.date <= fin));
  return out;
}

// Calendrier d'un seul logement depuis le cache du parc (null si absent ou périmé) : la ligne de
// détail d'un logement déplié n'a alors aucun appel Beds24 à faire.
export function calendrierDepuisCacheParc(roomId: number, debut: string, fin: string): Beds24CalendarDay[] | null {
  return calendriersParcDepuisCache([roomId], debut, fin)?.get(roomId) ?? null;
}

function ajouterJoursISO(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// Même lecture pour plusieurs logements en UN seul appel (roomId accepte une liste) : la
// détection des nuits isolées lit tout le parc à chaque synchro, sans multiplier les appels
// comptés par Beds24.
export async function beds24GetCalendars(roomIds: number[], startDate: string, endDate: string): Promise<Map<number, Beds24CalendarDay[]>> {
  const ids = [...new Set(roomIds.filter((id) => Number.isInteger(id) && id > 0))];
  const parRoom = new Map<number, Map<string, Beds24CalendarDay>>(ids.map((id) => [id, new Map()]));
  if (ids.length === 0) return new Map();

  const res = await beds24Fetch<{ data?: { roomId: number; calendar?: Beds24CalendarRange[] }[] }>("/inventory/rooms/calendar", {
    query: {
      roomId: ids,
      startDate,
      endDate,
      includePrices: true,
      includeNumAvail: true,
      includeMinStay: true,
      includeMaxStay: true,
      includeOverride: true,
    },
  });

  for (const room of res.data ?? []) {
    const parDate = parRoom.get(Number(room.roomId));
    if (!parDate) continue;
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
          override,
        });
      }
    }
  }

  return new Map([...parRoom.entries()].map(([id, parDate]) => [id, [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date))]));
}
