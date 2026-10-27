import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { StatutCaution } from "./regles";

// Une ligne par réservation : l'état de la caution par empreinte Stripe. Table créée à la volée
// (une fois par instance), comme reservation_journal : pas de migration drizzle-kit à lancer à la
// main sur Neon. Une seule instruction SQL par requête (API HTTP de Neon).
let tablePrete: Promise<void> | null = null;

export function assurerTableCautions(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cautions_stripe (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_id uuid NOT NULL,
          beds24_booking_id text NOT NULL,
          montant_centimes integer NOT NULL,
          devise text NOT NULL DEFAULT 'eur',
          statut text NOT NULL DEFAULT 'en_attente',
          checkout_session_id text,
          customer_id text,
          payment_method_id text,
          payment_intent_id text,
          autorisee_at timestamptz,
          nb_empreintes integer NOT NULL DEFAULT 0,
          dernier_echec text,
          liberee_at timestamptz,
          prelevee_at timestamptz,
          montant_preleve_centimes integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS cautions_stripe_reservation_idx ON cautions_stripe (reservation_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cautions_stripe_payment_intent_idx ON cautions_stripe (payment_intent_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cautions_stripe_session_idx ON cautions_stripe (checkout_session_id)`);
    })().catch((err) => {
      tablePrete = null; // on retentera au prochain appel
      throw err;
    });
  }
  return tablePrete;
}

export type Caution = {
  id: string;
  reservationId: string;
  beds24BookingId: string;
  montantCentimes: number;
  devise: string;
  statut: StatutCaution;
  checkoutSessionId: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
  paymentIntentId: string | null;
  autoriseeAt: Date | null;
  nbEmpreintes: number;
  dernierEchec: string | null;
  libereeAt: Date | null;
  preleveeAt: Date | null;
  montantPreleveCentimes: number | null;
};

type Ligne = {
  id: string;
  reservation_id: string;
  beds24_booking_id: string;
  montant_centimes: number;
  devise: string;
  statut: string;
  checkout_session_id: string | null;
  customer_id: string | null;
  payment_method_id: string | null;
  payment_intent_id: string | null;
  autorisee_at: string | Date | null;
  nb_empreintes: number;
  dernier_echec: string | null;
  liberee_at: string | Date | null;
  prelevee_at: string | Date | null;
  montant_preleve_centimes: number | null;
};

const date = (v: string | Date | null) => (v ? new Date(v) : null);

function depuisLigne(l: Ligne): Caution {
  return {
    id: l.id,
    reservationId: l.reservation_id,
    beds24BookingId: l.beds24_booking_id,
    montantCentimes: l.montant_centimes,
    devise: l.devise,
    statut: l.statut as StatutCaution,
    checkoutSessionId: l.checkout_session_id,
    customerId: l.customer_id,
    paymentMethodId: l.payment_method_id,
    paymentIntentId: l.payment_intent_id,
    autoriseeAt: date(l.autorisee_at),
    nbEmpreintes: l.nb_empreintes,
    dernierEchec: l.dernier_echec,
    libereeAt: date(l.liberee_at),
    preleveeAt: date(l.prelevee_at),
    montantPreleveCentimes: l.montant_preleve_centimes,
  };
}

async function requete(statement: ReturnType<typeof sql>): Promise<Ligne[]> {
  const res = (await getDb().execute(statement)) as unknown as { rows?: Ligne[] } | Ligne[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export async function cautionDeLaReservation(reservationId: string): Promise<Caution | null> {
  await assurerTableCautions();
  const [l] = await requete(sql`SELECT * FROM cautions_stripe WHERE reservation_id = ${reservationId} LIMIT 1`);
  return l ? depuisLigne(l) : null;
}

export async function cautionDeLaSession(checkoutSessionId: string): Promise<Caution | null> {
  await assurerTableCautions();
  const [l] = await requete(sql`SELECT * FROM cautions_stripe WHERE checkout_session_id = ${checkoutSessionId} LIMIT 1`);
  return l ? depuisLigne(l) : null;
}

export async function cautionDuPaymentIntent(paymentIntentId: string): Promise<Caution | null> {
  await assurerTableCautions();
  const [l] = await requete(sql`SELECT * FROM cautions_stripe WHERE payment_intent_id = ${paymentIntentId} LIMIT 1`);
  return l ? depuisLigne(l) : null;
}

// Cautions dont l'empreinte est active : le cron quotidien les parcourt pour renouveler ou lever.
export async function cautionsAutorisees(): Promise<Caution[]> {
  await assurerTableCautions();
  const lignes = await requete(sql`SELECT * FROM cautions_stripe WHERE statut = 'autorisee'`);
  return lignes.map(depuisLigne);
}

// Crée la ligne de la réservation, ou la met à jour pour un nouvel essai (même réservation,
// nouvelle session Checkout) tant que l'empreinte n'a pas été autorisée.
export async function preparerCaution(input: { reservationId: string; beds24BookingId: string; montantCentimes: number; devise: string; checkoutSessionId: string }): Promise<void> {
  await assurerTableCautions();
  await getDb().execute(sql`
    INSERT INTO cautions_stripe (reservation_id, beds24_booking_id, montant_centimes, devise, statut, checkout_session_id)
    VALUES (${input.reservationId}, ${input.beds24BookingId}, ${input.montantCentimes}, ${input.devise}, 'en_attente', ${input.checkoutSessionId})
    ON CONFLICT (reservation_id) DO UPDATE SET
      checkout_session_id = EXCLUDED.checkout_session_id,
      montant_centimes = EXCLUDED.montant_centimes,
      devise = EXCLUDED.devise,
      updated_at = now()
    WHERE cautions_stripe.statut IN ('en_attente', 'expiree', 'echec', 'liberee')
  `);
}

// Empreinte autorisée (première fois, ou renouvellement) : devient l'empreinte courante.
export async function marquerAutorisee(input: { id: string; customerId: string | null; paymentMethodId: string | null; paymentIntentId: string }): Promise<void> {
  await assurerTableCautions();
  await getDb().execute(sql`
    UPDATE cautions_stripe SET
      statut = 'autorisee',
      customer_id = COALESCE(${input.customerId}, customer_id),
      payment_method_id = COALESCE(${input.paymentMethodId}, payment_method_id),
      payment_intent_id = ${input.paymentIntentId},
      autorisee_at = now(),
      nb_empreintes = nb_empreintes + 1,
      dernier_echec = NULL,
      liberee_at = NULL,
      updated_at = now()
    WHERE id = ${input.id}
  `);
}

export async function changerStatut(id: string, statut: StatutCaution, extra: { echec?: string | null; montantPreleveCentimes?: number } = {}): Promise<void> {
  await assurerTableCautions();
  const libereeAt = statut === "liberee" ? sql`now()` : sql`liberee_at`;
  const preleveeAt = statut === "prelevee" ? sql`now()` : sql`prelevee_at`;
  await getDb().execute(sql`
    UPDATE cautions_stripe SET
      statut = ${statut},
      liberee_at = ${libereeAt},
      prelevee_at = ${preleveeAt},
      montant_preleve_centimes = COALESCE(${extra.montantPreleveCentimes ?? null}, montant_preleve_centimes),
      dernier_echec = ${extra.echec === undefined ? sql`dernier_echec` : extra.echec},
      updated_at = now()
    WHERE id = ${id}
  `);
}

export async function noterEchec(id: string, message: string): Promise<void> {
  await assurerTableCautions();
  await getDb().execute(sql`UPDATE cautions_stripe SET dernier_echec = ${message}, updated_at = now() WHERE id = ${id}`);
}
