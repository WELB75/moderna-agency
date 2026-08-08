// Client pour les endpoints Superhote nécessaires au paiement par carte (Villa Sofya, phase de
// test — voir mémoire projet pour tout l'historique). Deux clés distinctes, toutes deux dans
// Compte → Paramètres → "Paramètres Utilisateur" côté Superhote :
// - SUPERHOTE_API_KEY ("SH apiKey") : utilisée pour get-availabilities et create-booking.
// - SUPERHOTE_WEB_KEY ("Website key") : utilisée uniquement pour get-user-stripe-key.
// Confirmé en direct le 2026-08-08 : les deux fonctionnent avec les noms de champs ci-dessous
// (api_key/start_date/end_date, pas web_key/checking/checkout comme documenté ailleurs).
const BASE_URL = "https://app.superhote.com/api/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant dans les variables d'environnement.`);
  return value;
}

export type PriceBreakdown = {
  disponible: boolean;
  price: number;
  cleaning: number;
  cityTaxes: number;
  total: number;
};

// include_taxes=0 est indispensable : avec la valeur par défaut (1), Superhote renvoie un total
// agrégé TTC qui ne correspond pas au "price" attendu par create-booking (confirmé par leur
// support le 2026-08-08).
export async function getPriceBreakdown(propertyKey: string, dateArrivee: string, dateDepart: string): Promise<PriceBreakdown> {
  const apiKey = requireEnv("SUPERHOTE_API_KEY");
  const res = await fetch(`${BASE_URL}/get-availabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      property_key: propertyKey,
      start_date: dateArrivee,
      end_date: dateDepart,
      include_taxes: 0,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.status !== "success") {
    throw new Error(`Échec get-availabilities: ${JSON.stringify(data)}`);
  }
  const restrictions = data.restrictions as Record<string, { availability: number; price: number; cleaning: number; city_taxes: number }>;
  const entry = Object.values(restrictions)[0];
  if (!entry) throw new Error("Réponse get-availabilities vide.");
  const price = Number(entry.price) || 0;
  const cleaning = Number(entry.cleaning) || 0;
  const cityTaxes = Number(entry.city_taxes) || 0;
  return { disponible: entry.availability === 1, price, cleaning, cityTaxes, total: price + cleaning + cityTaxes };
}

// La clé publique Stripe est propre à CHAQUE logement (compte Stripe du propriétaire, pas du
// tout du Stripe Connect côté Superhote) — indispensable pour tokeniser la carte avec la bonne
// destination avant même d'appeler create-booking.
export async function getVillaStripePublicKey(propertyKey: string): Promise<string> {
  const webKey = requireEnv("SUPERHOTE_WEB_KEY");
  const res = await fetch(`${BASE_URL}/get-user-stripe-key/${webKey}/${propertyKey}`);
  const data = await res.json();
  if (!res.ok || data.status !== "success" || !data.publicKey) {
    throw new Error(`Échec get-user-stripe-key: ${JSON.stringify(data)}`);
  }
  return data.publicKey as string;
}

export type CreateBookingInput = {
  propertyKey: string;
  dateArrivee: string;
  dateDepart: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  paysIso: string; // ISO alpha-2, ex "FR"
  nbAdultes: number;
  nbEnfants: number;
  price: number;
  cleaning: number;
  cityTaxes: number;
  cardToken: string; // tok_... généré côté client via stripe.createToken()
};

export type CreateBookingResult =
  | { statut: "confirme"; superhoteBookingId: string }
  | { statut: "requires_3ds"; intentClientSecret: string; raw: unknown }
  | { statut: "echoue"; erreur: string };

// Superhote compare price/cleaning/city_taxes séparément à ce que get-availabilities aurait
// renvoyé pour les mêmes dates — un écart, même minime, fait échouer l'appel en 400. Ne jamais
// arrondir/recalculer ces montants soi-même, toujours réutiliser tels quels ceux de
// getPriceBreakdown.
export async function submitBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const apiKey = requireEnv("SUPERHOTE_API_KEY");
  const res = await fetch(`${BASE_URL}/create-booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      property_key: input.propertyKey,
      start_date: input.dateArrivee,
      end_date: input.dateDepart,
      first_name: input.prenom,
      last_name: input.nom,
      email: input.email,
      phone: input.telephone,
      country: input.paysIso,
      adults: input.nbAdultes,
      children: input.nbEnfants,
      price: input.price,
      cleaning: input.cleaning,
      city_taxes: input.cityTaxes,
      status: 1,
      source: "Direct",
      card_token: input.cardToken,
      is_required_card_detail: true,
    }),
  });
  const data = await res.json();

  if (data?.msg === "requires_source_action" && data?.intent) {
    return { statut: "requires_3ds", intentClientSecret: data.intent.client_secret ?? data.intent, raw: data };
  }
  if (!res.ok || data?.status !== "success") {
    const message = typeof data?.msg === "string" ? data.msg : JSON.stringify(data?.msg ?? data);
    return { statut: "echoue", erreur: message };
  }
  const bookingId = data?.booking_id ?? data?.id ?? data?.reservation_id;
  return { statut: "confirme", superhoteBookingId: String(bookingId ?? "") };
}
