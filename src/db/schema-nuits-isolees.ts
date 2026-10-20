import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Nuits isolées débloquées automatiquement par l'app (voir src/lib/beds24/nuits-isolees.ts) :
// une nuit libre coincée entre deux séjours/blocages, plus courte que le séjour minimum (ex. 1
// nuit libre avec "2 nuits minimum"), voit son séjour minimum abaissé dans Beds24 pour rester
// réservable sur Airbnb/Booking.com. On garde ici la valeur d'avant pour la remettre dès que la
// nuit n'est plus isolée (réservation annulée à côté...), sans jamais toucher une valeur changée
// entre-temps par PriceLabs ou à la main.
//
// Table créée à la volée (assurerTableNuitsIsolees) : pas de migration à lancer sur Neon.
export const nuitsIsoleesDeblocages = pgTable(
  "nuit_isolee_deblocage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    villaId: uuid("villa_id").notNull(),
    villaNom: text("villa_nom"),
    roomId: integer("room_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (nuit débloquée)
    minStayAvant: integer("min_stay_avant").notNull(),
    minStayApres: integer("min_stay_apres").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Rempli quand le déblocage est terminé : "reservee" (la nuit a trouvé preneur), "passee",
    // "restauree" (nuits min. d'avant remises), "remplacee" (valeur changée par PriceLabs ou à la
    // main entre-temps : on n'y touche plus), "manuel" (modifiée depuis le panneau nuits min.).
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    issue: text("issue"),
  },
  // Un seul déblocage EN COURS par nuit et par logement (le webhook et le cron Beds24 peuvent
  // tourner en même temps).
  (t) => [uniqueIndex("nuit_isolee_deblocage_actif_idx").on(t.roomId, t.date).where(sql`terminee_le IS NULL`)]
);

// Nuits minimum fixées À LA MAIN dans l'app (panneau de la vue planning) : priorité absolue sur
// PriceLabs et sur les nuits isolées quand l'app recalcule les nuits minimum envoyées à Beds24
// (voir nuitsMinVoulues dans lib/beds24/nuits-isolees-detection.ts). Une ligne par logement et
// par date ; les dates passées sont nettoyées à chaque synchro. Table créée à la volée.
export const nuitsMinManuelles = pgTable(
  "nuits_min_manuelles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    villaId: uuid("villa_id").notNull(),
    roomId: integer("room_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (arrivée concernée)
    minStay: integer("min_stay").notNull(),
    auteurNom: text("auteur_nom"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("nuits_min_manuelles_room_date_idx").on(t.roomId, t.date)]
);
