import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DOMAINE_PLANNING_VERS_APP,
  EQUIPE_TOURNEES_DEPART,
  type EquipierTournee,
  type Metier,
  type PassageTournee,
} from "@/lib/tournees-format";

// Intervenants extérieurs (jardinier, pisciniste) et leur planning hebdomadaire. Tables créées à la
// volée (comme acces_equipe) : pas de migration à lancer sur Neon. Le planning de départ (plannings
// papier de Brahim et Rachid, 2026-11-03) n'est inséré qu'à la création de la personne : une
// modification faite ensuite n'est jamais écrasée.

let tablesPretes: Promise<void> | null = null;

export function assurerTablesTournees(): Promise<void> {
  if (!tablesPretes) {
    tablesPretes = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS equipiers_tournees (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          nom text NOT NULL,
          metier text NOT NULL,
          telephone text,
          actif boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS equipiers_tournees_nom_idx ON equipiers_tournees (lower(nom))`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS tournees_passages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          equipier_id uuid NOT NULL REFERENCES equipiers_tournees(id) ON DELETE CASCADE,
          jour integer NOT NULL,
          ordre integer NOT NULL DEFAULT 0,
          domaine text,
          villas text,
          note text
        )
      `);
      for (const e of EQUIPE_TOURNEES_DEPART) {
        const cree = await db.execute(sql`
          INSERT INTO equipiers_tournees (nom, metier) VALUES (${e.nom}, ${e.metier})
          ON CONFLICT DO NOTHING RETURNING id
        `);
        const id = (cree.rows[0] as { id: string } | undefined)?.id;
        if (!id) continue;
        let ordre = 0;
        for (const p of e.passages) {
          await db.execute(sql`
            INSERT INTO tournees_passages (equipier_id, jour, ordre, domaine, villas, note)
            VALUES (${id}, ${p.jour}, ${ordre++}, ${p.domaine}, ${p.villas}, ${p.note})
          `);
        }
      }
    })().catch((err) => {
      tablesPretes = null;
      throw err;
    });
  }
  return tablesPretes;
}

export async function chargerEquipiersTournees(): Promise<EquipierTournee[]> {
  await assurerTablesTournees();
  const db = getDb();
  const equipiers = (await db.execute(sql`SELECT id, nom, metier, telephone, actif FROM equipiers_tournees WHERE actif ORDER BY metier, nom`)).rows as {
    id: string;
    nom: string;
    metier: Metier;
    telephone: string | null;
    actif: boolean;
  }[];
  const passages = (await db.execute(sql`SELECT equipier_id, jour, domaine, villas, note FROM tournees_passages ORDER BY jour, ordre`)).rows as (PassageTournee & {
    equipier_id: string;
  })[];
  return equipiers.map((e) => ({
    ...e,
    passages: passages.filter((p) => p.equipier_id === e.id).map(({ jour, domaine, villas, note }) => ({ jour, domaine, villas, note })),
  }));
}

// Noms des villas de l'app correspondant à un passage (« Domaine 08 : villas 1, 2, 7 » = Villa
// Eline, Villa Azur, Villa Elysée) pour répondre avec des noms que Kamel reconnaît. Les numéros
// absents de l'app (villas non gérées) sont simplement ignorés.
export async function villasDuPassage(p: PassageTournee): Promise<{ numero: string; nom: string }[]> {
  if (!p.domaine || !p.villas) return [];
  const domaineApp = DOMAINE_PLANNING_VERS_APP[p.domaine];
  if (!domaineApp) return [];
  const numeros = p.villas.split(",").map((n) => n.trim()).filter(Boolean);
  const rows = (await getDb().execute(sql`
    SELECT v.numero, v.nom FROM villas v JOIN domaines d ON d.id = v.domaine_id WHERE d.nom = ${domaineApp}
  `)).rows as { numero: string; nom: string }[];
  return numeros.flatMap((n) => rows.filter((r) => r.numero === n));
}
