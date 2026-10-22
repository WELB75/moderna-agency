import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // schema-recaps, schema-journal, schema-nuits-isolees, schema-acces et schema-syndic : tables à part (ne pas
  // les supprimer lors d'un db:push).
  schema: [
    "./src/db/schema.ts",
    "./src/db/schema-recaps.ts",
    "./src/db/schema-journal.ts",
    "./src/db/schema-nuits-isolees.ts",
    "./src/db/schema-acces.ts",
    "./src/db/schema-syndic.ts",
  ],
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
