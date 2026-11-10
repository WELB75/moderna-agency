import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { AvisNormalise } from "@/lib/avis/normaliser";

// Table des avis Airbnb / Booking.com, créée à la volée comme les autres tables récentes.
// Une ligne par (plateforme, identifiant d'avis) : la synchro quotidienne met à jour la note, la
// réponse et le masquage sans jamais créer de doublon.
let tablePrete: Promise<void> | null = null;

export function assurerTableAvis(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS avis_plateformes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          source text NOT NULL,
          external_id text NOT NULL,
          villa_id uuid,
          reservation_id uuid,
          note_origine numeric(4,1) NOT NULL,
          echelle integer NOT NULL,
          note10 numeric(4,1) NOT NULL,
          detail jsonb NOT NULL DEFAULT '[]',
          titre text,
          texte text,
          positif text,
          negatif text,
          retour_prive text,
          voyageur text,
          pays text,
          langue text,
          reponse text,
          repondu_at timestamptz,
          publie_at timestamptz,
          masque boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (source, external_id)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS avis_plateformes_villa_idx ON avis_plateformes (villa_id, publie_at DESC)`);
    })().catch((e) => {
      tablePrete = null;
      throw e;
    });
  }
  return tablePrete;
}

export async function enregistrerAvis(villaId: string | null, reservationId: string | null, a: AvisNormalise): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO avis_plateformes
      (source, external_id, villa_id, reservation_id, note_origine, echelle, note10, detail, titre, texte, positif, negatif,
       retour_prive, voyageur, pays, langue, reponse, repondu_at, publie_at, masque)
    VALUES
      (${a.source}, ${a.externalId}, ${villaId}, ${reservationId}, ${a.noteOrigine}, ${a.echelle}, ${a.note10},
       ${JSON.stringify(a.detail)}::jsonb, ${a.titre}, ${a.texte}, ${a.positif}, ${a.negatif}, ${a.retourPrive}, ${a.voyageur},
       ${a.pays}, ${a.langue}, ${a.reponse}, ${a.reponduAt}, ${a.publieAt}, ${a.masque})
    ON CONFLICT (source, external_id) DO UPDATE SET
      villa_id = COALESCE(EXCLUDED.villa_id, avis_plateformes.villa_id),
      reservation_id = COALESCE(EXCLUDED.reservation_id, avis_plateformes.reservation_id),
      note_origine = EXCLUDED.note_origine, echelle = EXCLUDED.echelle, note10 = EXCLUDED.note10, detail = EXCLUDED.detail,
      titre = EXCLUDED.titre, texte = EXCLUDED.texte, positif = EXCLUDED.positif, negatif = EXCLUDED.negatif,
      retour_prive = EXCLUDED.retour_prive, voyageur = EXCLUDED.voyageur, pays = EXCLUDED.pays, langue = EXCLUDED.langue,
      reponse = EXCLUDED.reponse, repondu_at = EXCLUDED.repondu_at, publie_at = COALESCE(EXCLUDED.publie_at, avis_plateformes.publie_at),
      masque = EXCLUDED.masque, updated_at = now()
  `);
}

export type AvisLigne = {
  id: string;
  source: "airbnb" | "booking";
  villaId: string | null;
  villaNom: string | null;
  villaType: string | null;
  domaineNom: string | null;
  reservationId: string | null;
  noteOrigine: number;
  echelle: 5 | 10;
  note10: number;
  detail: { cle: string; note10: number }[];
  titre: string | null;
  texte: string | null;
  positif: string | null;
  negatif: string | null;
  retourPrive: string | null;
  voyageur: string | null;
  pays: string | null;
  langue: string | null;
  reponse: string | null;
  reponduAt: Date | null;
  publieAt: Date | null;
  masque: boolean;
};

// Tous les avis (avec leur logement), les plus récents d'abord. `villaId` : un seul logement
// (espace propriétaire).
export async function chargerAvis(options: { villaId?: string } = {}): Promise<AvisLigne[]> {
  await assurerTableAvis();
  const filtre = options.villaId ? sql`WHERE a.villa_id = ${options.villaId}::uuid` : sql``;
  const res = await getDb().execute(sql`
    SELECT a.*, v.nom AS villa_nom, v.type AS villa_type, d.nom AS domaine_nom
    FROM avis_plateformes a
    LEFT JOIN villas v ON v.id = a.villa_id
    LEFT JOIN domaines d ON d.id = v.domaine_id
    ${filtre}
    ORDER BY a.publie_at DESC NULLS LAST
  `);
  const rows = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[])) as Record<string, unknown>[];
  const d = (v: unknown) => (v ? new Date(String(v)) : null);
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return rows.map((r) => ({
    id: String(r.id),
    source: r.source as "airbnb" | "booking",
    villaId: s(r.villa_id),
    villaNom: s(r.villa_nom),
    villaType: s(r.villa_type),
    domaineNom: s(r.domaine_nom),
    reservationId: s(r.reservation_id),
    noteOrigine: Number(r.note_origine),
    echelle: Number(r.echelle) === 5 ? 5 : 10,
    note10: Number(r.note10),
    detail: Array.isArray(r.detail) ? (r.detail as { cle: string; note10: number }[]) : [],
    titre: s(r.titre),
    texte: s(r.texte),
    positif: s(r.positif),
    negatif: s(r.negatif),
    retourPrive: s(r.retour_prive),
    voyageur: s(r.voyageur),
    pays: s(r.pays),
    langue: s(r.langue),
    reponse: s(r.reponse),
    reponduAt: d(r.repondu_at),
    publieAt: d(r.publie_at),
    masque: r.masque === true,
  }));
}
