import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Comptes autorisés à ouvrir le back-office (2026-10-21, « commençons par la sécurité ») :
// jusqu'ici, n'importe quel compte Clerk avait accès à tout, et l'inscription était ouverte à
// tous sur admin.superhosts.ma/sign-up. Un compte inconnu qui se connecte est maintenant inscrit
// ici "en_attente" et ne voit que la page /acces-refuse, jusqu'à ce qu'un administrateur le
// valide dans la page Accès. Voir src/lib/acces.ts et src/proxy.ts.
//
// Table créée à la volée (assurerTableAcces) : pas de migration à lancer sur Neon.
export const accesEquipe = pgTable(
  "acces_equipe",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(), // toujours en minuscules
    nom: text("nom"),
    role: text("role").$type<"admin" | "membre">().notNull().default("membre"),
    statut: text("statut").$type<"autorise" | "en_attente" | "refuse">().notNull().default("en_attente"),
    clerkUserId: text("clerk_user_id"),
    decidePar: text("decide_par"),
    decideLe: timestamp("decide_le", { withTimezone: true }),
    derniereTentative: timestamp("derniere_tentative", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("acces_equipe_email_idx").on(t.email)]
);
