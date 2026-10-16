import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { reservations } from "./schema";

// Récapitulatif d'une réservation directe : prix PriceLabs, promo, avance, reste à encaisser et
// remarque interne, plus le jeton du lien de partage public (/s/[token]). Table à part (et non
// des colonnes de `reservations`) pour ne pas toucher au modèle principal. Kamel, 2026-10-14 :
// "un champ promo [...] connecté à PriceLabs [...] un champ remarque [...] et à la fin un lien".
export const reservationRecaps = pgTable("reservation_recaps", {
  id: uuid("id").defaultRandom().primaryKey(),
  reservationId: uuid("reservation_id")
    .notNull()
    .unique()
    .references(() => reservations.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  devise: text("devise").notNull().default("EUR"),
  // Total des nuits au tarif PriceLabs (null si PriceLabs indisponible : prix saisi à la main).
  prixPricelabs: numeric("prix_pricelabs", { precision: 10, scale: 2 }),
  promoType: text("promo_type"), // "pourcentage" | "montant" | null
  promoValeur: numeric("promo_valeur", { precision: 10, scale: 2 }),
  totalFinal: numeric("total_final", { precision: 10, scale: 2 }),
  avanceVersee: numeric("avance_versee", { precision: 10, scale: 2 }),
  modeReglement: text("mode_reglement"), // "sur_place" | "virement" | null — comment encaisser le reste
  remarqueInterne: text("remarque_interne"), // jamais affichée sur le lien public
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Suivi "lu" de la boîte de réception : une ligne par conversation (clé de l'inbox), avec l'heure
// à laquelle elle a été ouverte. Une conversation est "non lue" si le dernier message du voyageur
// est plus récent que cette heure. Alimente la pastille "Messages" du menu.
export const inboxReads = pgTable("inbox_reads", {
  convKey: text("conv_key").primaryKey(),
  readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
});
