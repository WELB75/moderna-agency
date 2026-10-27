// Règles de la caution par empreinte bancaire Stripe (sans débit) — logique pure, sans base ni
// réseau, pour pouvoir la tester (voir regles.test.ts).
//
// Une empreinte (PaymentIntent en capture manuelle) est retenue par la banque du voyageur pendant
// 7 jours au plus. Pour un séjour plus long, l'app refait une empreinte sur la carte enregistrée
// avant que la première expire (cron quotidien, voir /api/caution/sweep).

const JOUR_MS = 24 * 60 * 60 * 1000;

// Âge minimal d'une empreinte avant d'en refaire une : 5 jours, soit 2 jours de marge avant
// l'expiration à 7 jours, pour qu'un échec (carte refusée, authentification demandée) laisse le
// temps à l'équipe de réagir avant que le séjour ne soit plus couvert.
export const AGE_RENOUVELLEMENT_JOURS = 5;

// Une fois le départ passé depuis ce délai, l'empreinte est levée automatiquement (l'équipe a eu
// le temps de faire l'état des lieux et de prélever en cas de dégât). Sans cette levée, Stripe
// finit de toute façon par annuler l'empreinte au bout de 7 jours.
export const JOURS_AVANT_LEVEE_AUTO = 3;

export const STATUTS_CAUTION = ["en_attente", "autorisee", "liberee", "prelevee", "expiree", "echec"] as const;
export type StatutCaution = (typeof STATUTS_CAUTION)[number];

// Montant en euros (nombre ou texte "250.00") -> centimes entiers. null si invalide ou <= 0.
export function enCentimes(montant: string | number | null | undefined): number | null {
  if (montant === null || montant === undefined || montant === "") return null;
  const n = typeof montant === "number" ? montant : Number(String(montant).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function formatEuros(centimes: number): string {
  const euros = centimes / 100;
  return `${euros.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(euros) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

// Faut-il refaire l'empreinte maintenant ? `maintenant` et `depart` sont comparés dans le même
// repère (heure du Maroc "affichée", voir lib/now.ts) ; `autoriseeAt` est un vrai instant UTC et
// ne sert qu'à calculer un âge, donc sans effet de fuseau.
export function doitRenouveler(input: { statut: StatutCaution; autoriseeAt: Date | null; depart: Date; maintenant: Date; vraiMaintenant?: Date }): boolean {
  if (input.statut !== "autorisee" || !input.autoriseeAt) return false;
  // Le séjour doit encore durer au-delà de demain : sinon l'empreinte actuelle (au moins 2 jours
  // de validité restante) couvre jusqu'au départ.
  if (input.depart.getTime() <= input.maintenant.getTime() + JOUR_MS) return false;
  const reel = input.vraiMaintenant ?? new Date();
  const ageJours = (reel.getTime() - input.autoriseeAt.getTime()) / JOUR_MS;
  return ageJours >= AGE_RENOUVELLEMENT_JOURS;
}

// Faut-il lever l'empreinte automatiquement ? (départ + JOURS_AVANT_LEVEE_AUTO jours dépassé)
export function doitLeverAutomatiquement(input: { statut: StatutCaution; depart: Date; maintenant: Date }): boolean {
  if (input.statut !== "autorisee") return false;
  return input.maintenant.getTime() >= input.depart.getTime() + JOURS_AVANT_LEVEE_AUTO * JOUR_MS;
}

// Une demande de caution n'a de sens que pour une réservation Booking.com / Direct encore
// d'actualité (jamais Airbnb, qui gère sa propre caution) : c'est le même périmètre que les
// actions automatiques de Beds24 (voir cautionPrevue dans lib/beds24/sync.ts).
export function cautionDemandable(input: { canal: string | null; status: string; depart: Date; maintenant: Date }): { ok: true } | { ok: false; raison: "airbnb" | "annulee" | "terminee" } {
  if ((input.canal ?? "").toLowerCase().includes("airbnb")) return { ok: false, raison: "airbnb" };
  if (input.status === "annulee") return { ok: false, raison: "annulee" };
  // Séjour fini depuis plus de 7 jours : plus d'empreinte à prendre.
  if (input.depart.getTime() < input.maintenant.getTime() - 7 * JOUR_MS) return { ok: false, raison: "terminee" };
  return { ok: true };
}
