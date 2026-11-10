// Avis Airbnb / Booking.com renvoyés par Beds24 (GET /channels/airbnb/reviews, endpoint bêta, et
// GET /channels/booking/reviews, alpha) ramenés à un format commun — Kamel, 2026-11-10 :
// « un onglet Avis avec tout ça ». Fichier sans import : testé avec node --test.
//
// Échelles : Airbnb note de 1 à 5, Booking.com de 0 à 10. La « note unifiée » (note10) ramène tout
// sur 10 (Airbnb × 2) pour classer les logements et suivre une tendance ; la note d'origine reste
// stockée et affichée à côté.

export type SourceAvis = "airbnb" | "booking";

export type CategorieAvis = "proprete" | "localisation" | "qualite_prix" | "communication" | "arrivee" | "precision" | "equipements" | "accueil";

export const LIBELLE_CATEGORIE: Record<CategorieAvis, string> = {
  proprete: "Propreté",
  localisation: "Localisation",
  qualite_prix: "Rapport qualité-prix",
  communication: "Communication",
  arrivee: "Arrivée",
  precision: "Conformité à l'annonce",
  equipements: "Équipements",
  accueil: "Accueil et service",
};

export type AvisNormalise = {
  source: SourceAvis;
  externalId: string;
  noteOrigine: number;
  echelle: 5 | 10;
  note10: number;
  detail: { cle: CategorieAvis; note10: number }[];
  titre: string | null;
  texte: string | null; // Airbnb : avis public ; Booking : positif + négatif réunis
  positif: string | null;
  negatif: string | null;
  retourPrive: string | null; // Airbnb seulement, jamais montré aux propriétaires
  voyageur: string | null;
  pays: string | null;
  langue: string | null;
  reponse: string | null;
  reponduAt: Date | null;
  publieAt: Date | null;
  masque: boolean;
  reservationRef: string | null; // Booking : numéro de réservation Booking.com
};

const texte = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};
const nombre = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const arrondi1 = (n: number) => Math.round(n * 10) / 10;

function date(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  // Booking : « 2018-05-13 12:16:33 » sans fuseau, lu comme UTC.
  const brut = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v;
  const d = new Date(brut);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CAT_AIRBNB: Record<string, CategorieAvis> = {
  cleanliness: "proprete",
  accuracy: "precision",
  checkin: "arrivee",
  communication: "communication",
  location: "localisation",
  value: "qualite_prix",
};

export function normaliserAvisAirbnb(raw: unknown): AvisNormalise | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const id = texte(r.id) ?? (typeof r.id === "number" ? String(r.id) : null);
  const note = nombre(r.overall_rating);
  if (!id || note === null || note < 1) return null;
  // L'endpoint renvoie les avis des voyageurs sur l'hôte ; on écarte ceux écrits par l'hôte.
  if (typeof r.reviewer_role === "string" && r.reviewer_role.toLowerCase() === "host") return null;
  if (r.submitted === false) return null;

  const detail: AvisNormalise["detail"] = [];
  if (Array.isArray(r.category_ratings)) {
    for (const c of r.category_ratings as Record<string, unknown>[]) {
      const cle = CAT_AIRBNB[String(c?.category ?? "").toLowerCase().replace(/^.*?(cleanliness|accuracy|checkin|communication|location|value).*$/, "$1")];
      const n = nombre(c?.rating);
      if (cle && n !== null && n >= 1) detail.push({ cle, note10: arrondi1(n * 2) });
    }
  }
  const reponse = texte(r.reviewee_response);
  return {
    source: "airbnb",
    externalId: id,
    noteOrigine: note,
    echelle: 5,
    note10: arrondi1(note * 2),
    detail,
    titre: null,
    texte: texte(r.public_review),
    positif: null,
    negatif: null,
    retourPrive: texte(r.private_feedback),
    voyageur: null,
    pays: null,
    langue: null,
    reponse,
    reponduAt: reponse ? date(r.responded_at) : null,
    publieAt: date(r.submitted_at) ?? date(r.first_completed_at),
    masque: r.hidden === true,
    reservationRef: null,
  };
}

export function normaliserAvisBooking(raw: unknown): AvisNormalise | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- réponse Beds24 brute, champs lus un à un
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== "object") return null;
  const id = texte(r.review_id) ?? (typeof r.review_id === "number" ? String(r.review_id) : null);
  const note = nombre(r.scoring?.review_score);
  if (!id || note === null) return null;

  const cats: [CategorieAvis, unknown][] = [
    ["proprete", r.scoring?.clean],
    ["equipements", r.scoring?.facilities],
    ["localisation", r.scoring?.location],
    ["accueil", r.scoring?.services],
    ["communication", r.scoring?.staff],
    ["qualite_prix", r.scoring?.value],
  ];
  const detail: AvisNormalise["detail"] = [];
  for (const [cle, v] of cats) {
    const n = nombre(v);
    if (n !== null && n > 0) detail.push({ cle, note10: arrondi1(n) });
  }
  const positif = texte(r.content?.positive);
  const negatif = texte(r.content?.negative);
  const reponse = texte(r.reply?.text);
  const ref = r.reservation_id;
  return {
    source: "booking",
    externalId: id,
    noteOrigine: arrondi1(note),
    echelle: 10,
    note10: arrondi1(note),
    detail,
    titre: texte(r.content?.headline),
    texte: [positif, negatif].filter(Boolean).join("\n\n") || null,
    positif,
    negatif,
    retourPrive: null,
    voyageur: texte(r.reviewer?.name),
    pays: texte(r.reviewer?.country_code)?.toUpperCase() ?? null,
    langue: texte(r.content?.language_code),
    reponse,
    reponduAt: reponse ? date(r.reply?.last_change_timestamp) : null,
    publieAt: date(r.created_timestamp),
    masque: false,
    reservationRef: ref === null || ref === undefined || ref === "" ? null : String(ref),
  };
}
