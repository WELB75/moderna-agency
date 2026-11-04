// Lecture du détail financier écrit à la main dans la note d'une réservation — Kamel, 2026-11-04 :
// « on met des petites notes et normalement, avec ces notes-là, tu peux savoir des choses ». Ex. :
// « 500dh/ nuitée *total: 1000dh* frais de ménage de fin de séjour: 200dh. total 1200dh la cliente
// a payé la totalité en espèce ». Les notes de l'équipe suivent quelques schémas réguliers ; on
// n'en lit que ce qui est sans ambiguïté et qui se recoupe, jamais de devinette :
// - un montant précédé (ou suivi) d'un mot de paiement (payé, acompte, versé, propriétaire...) est
//   un règlement, pas un prix : ignoré ;
// - il faut au moins le prix de la location, et si la note donne un total il doit être égal à la
//   somme des postes (à 2 % près), sinon rien n'est repris.
// Fichier sans import (testé avec node --test).

export type DeviseNote = "MAD" | "EUR";

export type DetailNote = {
  devise: DeviseNote;
  location: number;
  menage: number;
  cuisine: number;
  menageExtra: number;
  pompeAChaleur: number;
  total: number; // somme des postes, dans la devise de la note
};

type Poste = "ignore" | "menageExtra" | "menage" | "cuisine" | "pompe" | "locationTotal" | "total";

const MONTANT = /(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(dhs?|mad|€|eur(?:os?)?)(?![a-zà-ÿ])/gi;

// Mots qui qualifient un montant ; le plus proche avant le montant l'emporte, sinon le premier après.
const MOTS: { re: RegExp; poste: Poste }[] = [
  { re: /pay[ée]e?s?|paye|acompte|vers[ée]e?s?|avance|propri[ée]taire|esp[èe]ces?|virement/gi, poste: "ignore" },
  { re: /m[ée]nage\s+(journalier|quotidien)|extra\s+m[ée]nage|m[ée]nage\s+extra/gi, poste: "menageExtra" },
  { re: /m[ée]nage/gi, poste: "menage" },
  { re: /cuisini[èe]re?|cuisine|petit[\s-]?d[ée]j/gi, poste: "cuisine" },
  { re: /pompe|piscine/gi, poste: "pompe" },
  { re: /nuit[ée]*s?/gi, poste: "locationTotal" },
  { re: /total/gi, poste: "total" },
];

function nombre(entier: string, decimales: string | undefined): number {
  return Number(entier.replace(/[\s ]/g, "")) + (decimales ? Number(`0.${decimales}`) : 0);
}

function posteProche(fenetre: string, versLaFin: boolean): Poste | null {
  let meilleur: { poste: Poste; index: number } | null = null;
  for (const { re, poste } of MOTS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fenetre))) {
      const index = m.index;
      const mieux = !meilleur || (versLaFin ? index > meilleur.index : index < meilleur.index);
      if (mieux) meilleur = { poste, index };
    }
  }
  return meilleur?.poste ?? null;
}

const arrondir = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lireDetailNote(note: string | null | undefined, nuits: number): DetailNote | null {
  const texte = String(note ?? "").replace(/\*/g, " ");
  const jetons: { valeur: number; devise: DeviseNote; debut: number; fin: number }[] = [];
  for (const m of texte.matchAll(MONTANT)) {
    const devise: DeviseNote = /€|eur/i.test(m[3]) ? "EUR" : "MAD";
    jetons.push({ valeur: nombre(m[1], m[2]), devise, debut: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  }
  if (jetons.length === 0) return null;

  const postes: Record<Exclude<Poste, "ignore">, number | null> = { menageExtra: null, menage: null, cuisine: null, pompe: null, locationTotal: null, total: null };
  let parNuit: number | null = null;
  let ambigue = false;
  const devises = new Set<DeviseNote>();

  jetons.forEach((j, i) => {
    const apres = texte.slice(j.fin, jetons[i + 1]?.debut ?? texte.length);
    // « 500dh/ nuitée » : tarif par nuit.
    if (/^\s*\/\s*(nuit|n\b)/i.test(apres)) {
      parNuit = j.valeur;
      devises.add(j.devise);
      return;
    }
    // Le « / nuitée » qui suit un tarif par nuit appartient à ce tarif, pas au montant suivant.
    const avantBrut = texte.slice(i > 0 ? jetons[i - 1].fin : 0, j.debut).replace(/^\s*\/\s*nuit[ée]*s?/i, "");
    // Une phrase terminée ne qualifie pas le montant suivant (« ... 200dh. total 1200dh »).
    const avant = avantBrut.slice(Math.max(avantBrut.lastIndexOf(". "), avantBrut.lastIndexOf("\n")) + 1);
    let poste = posteProche(avant, true) ?? posteProche(apres.split(/[.\n]/)[0], false);
    if (!poste || poste === "ignore") return;
    // « 500dh/nuitée total: 1000dh » : le total qui suit un tarif par nuit, égal à tarif × nuits, est
    // celui des nuitées, pas le total général.
    if (poste === "total" && parNuit !== null && nuits > 0 && Math.abs(j.valeur - parNuit * nuits) < 1) poste = "locationTotal";
    devises.add(j.devise);
    // Deux montants différents pour le même poste : la note est ambiguë, on ne reprend rien.
    if (postes[poste] !== null && postes[poste] !== j.valeur) ambigue = true;
    postes[poste] = j.valeur;
  });

  if (ambigue || devises.size !== 1) return null;
  const devise = [...devises][0];

  const menage = postes.menage ?? 0;
  const cuisine = postes.cuisine ?? 0;
  const menageExtra = postes.menageExtra ?? 0;
  const pompe = postes.pompe ?? 0;
  const extras = menage + cuisine + menageExtra + pompe;

  let location: number | null = postes.locationTotal;
  if (location === null && parNuit !== null && nuits > 0) location = parNuit * nuits;
  if (location === null && postes.total !== null && extras > 0 && postes.total > extras) location = postes.total - extras;
  if (location === null || location <= 0) return null;

  const somme = location + extras;
  // Le total de la note doit retomber sur la somme des postes : sinon la note est ambiguë.
  if (postes.total !== null && Math.abs(postes.total - somme) > Math.max(1, postes.total * 0.02)) return null;

  return { devise, location: arrondir(location), menage: arrondir(menage), cuisine: arrondir(cuisine), menageExtra: arrondir(menageExtra), pompeAChaleur: arrondir(pompe), total: arrondir(somme) };
}

// Met les montants de la note dans la devise du rapport. Quand le loyer enregistré est connu et
// proche de la note convertie (les loyers directs en dirhams sont enregistrés au taux du jour), les
// postes sont ramenés exactement à ce loyer, pour que la somme des colonnes tombe juste ; sinon
// conversion au taux fourni.
export function convertirDetailNote(
  d: DetailNote,
  loyerCible: number | null,
  versCible: (montant: number, devise: DeviseNote) => number
): Omit<DetailNote, "devise"> {
  const conv = (n: number) => versCible(n, d.devise);
  const totalConverti = conv(d.total);
  const facteur = loyerCible && loyerCible > 0 && totalConverti > 0 && Math.abs(loyerCible - totalConverti) <= totalConverti * 0.15 ? loyerCible / totalConverti : 1;
  const c = (n: number) => arrondir(conv(n) * facteur);
  const location = c(d.location);
  const menage = c(d.menage);
  const cuisine = c(d.cuisine);
  const menageExtra = c(d.menageExtra);
  const pompeAChaleur = c(d.pompeAChaleur);
  return { location, menage, cuisine, menageExtra, pompeAChaleur, total: arrondir(location + menage + cuisine + menageExtra + pompeAChaleur) };
}
