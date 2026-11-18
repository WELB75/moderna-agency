import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { reservations } from "./schema";

// Demandes de services/activités faites par le voyageur depuis son lien /sejour/[id]
// (2026-11-18, test sans tarifs : il coche, choisit le jour, l'heure et le nombre de personnes).
// Une ligne par service demandé ; l'équipe confirme ou refuse depuis /demandes.
// Table créée à la main (CREATE TABLE IF NOT EXISTS), pas via db:push.
export const demandesServices = pgTable(
  "demandes_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "cascade" }).notNull(),
    serviceKey: text("service_key").notNull(), // clé du catalogue, voir lib/services-catalogue.ts
    serviceLabel: text("service_label").notNull(), // libellé figé (français) au moment de la demande
    jour: text("jour").notNull(), // AAAA-MM-JJ
    heure: text("heure").notNull(), // HH:MM, ou "flexible"
    nbPersonnes: integer("nb_personnes").notNull().default(1),
    note: text("note"),
    statut: text("statut").$type<"demandee" | "confirmee" | "refusee" | "terminee">().notNull().default("demandee"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("demandes_services_reservation_idx").on(t.reservationId)]
);
