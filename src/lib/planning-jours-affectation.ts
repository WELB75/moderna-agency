import { addDays, startOfDay } from "date-fns";

export type AffectationPourPlage = {
  id: string;
  reservationId: string;
  role: "menage" | "cuisine";
  moment: "sejour" | "depart" | "unique";
  nbJours: number | null;
  createdAt: Date;
};

// Calcule la plage de jours [début, fin] (incluse) que couvre chaque affectation cuisine (ou
// ménage "pendant le séjour") d'une réservation, pour savoir QUEL jour revient à QUI dans la
// grille du planning. jusqu'ici nbJours ne servait qu'au calcul du montant (voir schema.ts) — la
// grille affichait toute personne affectée sur TOUS les jours du séjour, même quand plusieurs
// personnes se partageaient les jours (ex. une ne peut plus faire qu'1 jour sur 4, une autre
// reprend les 3 restants) : les deux apparaissaient les 4 jours au lieu de leur jour respectif.
//
// Cas normal (une seule personne affectée) : elle couvre tout le séjour, comme avant, quel que
// soit nbJours (qui ne raccourcit alors que le montant si elle n'a pas fait tous les jours).
// Cas de partage (plusieurs personnes) : triées par date d'affectation — la plus ancienne (en
// général l'affectation d'origine) garde les premiers jours, toute personne ajoutée ensuite
// reprend la suite — puis découpées en tranches contiguës selon nbJours (1 jour par défaut si
// non précisé, même convention que l'aperçu de montant dans PersonnelAffectationEditor).
// Kamel, 2026-08-28 : "khadija elle fait que un jour avant c'était 4 mais elle peut pas, du coup
// j'ai ajouté nawal donc normalement faut que ça recalcule et modifie en auto".
export function plagesJoursParAffectation(
  affectations: AffectationPourPlage[],
  checkIn: Date,
  checkOut: Date
): Map<string, { debut: Date; fin: Date }> {
  const debutSejour = startOfDay(addDays(checkIn, 1));
  const finSejour = startOfDay(checkOut);
  const plages = new Map<string, { debut: Date; fin: Date }>();
  if (affectations.length === 0) return plages;

  if (affectations.length === 1) {
    plages.set(affectations[0].id, { debut: debutSejour, fin: finSejour });
    return plages;
  }

  const triees = [...affectations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let curseur = debutSejour;
  for (const a of triees) {
    if (curseur > finSejour) break;
    const jours = Math.max(1, a.nbJours ?? 1);
    const finBrute = startOfDay(addDays(curseur, jours - 1));
    const fin = finBrute > finSejour ? finSejour : finBrute;
    plages.set(a.id, { debut: curseur, fin });
    curseur = addDays(fin, 1);
  }
  return plages;
}

// Regroupe par (reservationId, role, moment) — même granularité que l'index unique
// personnel_affectations_unique_idx — et calcule la plage de chacune en une passe, pour appeler
// une seule fois par réservation plutôt que de re-trier à chaque jour de la semaine affichée.
export function plagesJoursParReservation(
  affectations: AffectationPourPlage[],
  reservationsById: Map<string, { checkIn: Date | string; checkOut: Date | string }>
): Map<string, { debut: Date; fin: Date }> {
  const groupes = new Map<string, AffectationPourPlage[]>();
  for (const a of affectations) {
    // Ménage "depart" reste un seul jour fixe (le check-out) — pas de notion de plage à partager.
    if (a.role === "menage" && a.moment === "depart") continue;
    const cle = `${a.reservationId}:${a.role}:${a.moment}`;
    const groupe = groupes.get(cle);
    if (groupe) groupe.push(a);
    else groupes.set(cle, [a]);
  }

  const plages = new Map<string, { debut: Date; fin: Date }>();
  for (const groupe of groupes.values()) {
    const r = reservationsById.get(groupe[0].reservationId);
    if (!r) continue;
    const sousPlages = plagesJoursParAffectation(groupe, new Date(r.checkIn), new Date(r.checkOut));
    for (const [id, plage] of sousPlages) plages.set(id, plage);
  }
  return plages;
}
