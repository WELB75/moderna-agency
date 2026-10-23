// Calendrier journalier d'un logement, sous deux formes :
// - JourTarif[] : une entrée par jour, pratique à manipuler (grille du planning, devis rapide) ;
// - JoursCompacts : la même information en tableaux parallèles, ~10 fois plus légère sur le réseau.
//
// Pourquoi : le planning embarquait 16 logements × 365 jours × { date, price, minStay, unbookable }
// dans le HTML de /calendrier et dans /api/tarification — près de 400 Ko de JSON rien que pour
// les jours, rechargés à chaque ouverture, sur téléphone aussi. En compact, la date n'est plus
// répétée 365 fois (on garde la première et on déduit les suivantes), et les jours bloqués sont
// listés par index. Fichier sans dépendance serveur : importable côté client.

export type JourTarif = { date: string; price: number | null; unbookable: boolean; minStay?: number | null };

export type JoursCompacts = {
  debut: string | null; // date (YYYY-MM-DD) du premier jour, null si aucun jour
  prix: (number | null)[]; // prix de chaque jour, dans l'ordre à partir de `debut`
  minStay: (number | null)[]; // nuits minimum PriceLabs pour une arrivée ce jour-là
  bloques: number[]; // index des jours non réservables (unbookable)
};

const JOUR_MS = 86_400_000;

function ajouterJours(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
}

export function compacterJours(jours: JourTarif[]): JoursCompacts {
  // Les jours arrivent triés et consécutifs depuis PriceLabs ; on tolère quand même un trou en
  // comblant avec des jours vides (prix null, non bloqués) pour que l'index reste = écart de jours.
  const tries = [...jours].sort((a, b) => a.date.localeCompare(b.date));
  if (tries.length === 0) return { debut: null, prix: [], minStay: [], bloques: [] };
  const debut = tries[0].date;
  const prix: (number | null)[] = [];
  const minStay: (number | null)[] = [];
  const bloques: number[] = [];
  for (const j of tries) {
    const index = Math.round((Date.parse(`${j.date}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / JOUR_MS);
    while (prix.length < index) {
      prix.push(null);
      minStay.push(null);
    }
    prix[index] = j.price;
    minStay[index] = j.minStay ?? null;
    if (j.unbookable) bloques.push(index);
  }
  return { debut, prix, minStay, bloques };
}

export function deplierJours(compacts: JoursCompacts | null | undefined): JourTarif[] {
  if (!compacts || !compacts.debut) return [];
  const bloques = new Set(compacts.bloques);
  return compacts.prix.map((price, i) => ({
    date: i === 0 ? compacts.debut! : ajouterJours(compacts.debut!, i),
    price,
    unbookable: bloques.has(i),
    minStay: compacts.minStay[i] ?? null,
  }));
}

// Raccourci pour un logement du planning (voir TarificationVilla dans lib/pricelabs/sync.ts).
export function joursVilla(villa: { jours: JoursCompacts }): JourTarif[] {
  return deplierJours(villa.jours);
}
