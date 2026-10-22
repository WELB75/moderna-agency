import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// En-tête du syndic de copropriété de chaque appartement (Noria), pour la « Déclaration sur
// l'honneur » que l'équipe remet à la sécurité de la résidence à chaque séjour (2026-10-22,
// Imane : « voici ce que je remplis pour la sécurité »). Le reste du document (voyageurs et
// numéros de pièce, appartement, immeuble, dates) vient de la fiche police et de la réservation ;
// seule la résidence doit être renseignée une fois par appartement. Voir src/lib/syndic.ts.
//
// Table créée à la volée (assurerTableSyndic) : pas de migration à lancer sur Neon.
export const syndicLogements = pgTable("syndic_logements", {
  villaId: uuid("villa_id").primaryKey(),
  // Deuxième ligne de l'en-tête, après « SYNDICAT DES COPROPRIETAIRES » :
  // ex. « DE L'E.IM CHRIFIA M1-TR3 - RESIDENCE ISLI 2 ».
  entete: text("entete").notNull(),
  // Nom court de la résidence dans le corps du texte (« Située à la résidence ISLI 2 »).
  residence: text("residence").notNull(),
  // WhatsApp du syndic / gardien de la résidence : destinataire du lien du dossier du séjour.
  whatsapp: text("whatsapp"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
