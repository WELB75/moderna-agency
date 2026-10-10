import { addDays, endOfDay, startOfDay, subDays } from "date-fns";

// Règles partagées par l'accueil ("Ce qui a besoin de vous") et la vue Liste du calendrier
// (filtres "Impayées" / "Cautions"), pour que les compteurs et les listes disent toujours la
// même chose.

type ResaPaiement = {
  canal: string | null;
  checkIn: Date | string;
  checkOut: Date | string;
  loyerTotal: string | number | null;
  montantPaye: string | number | null;
  caution: string | number | null;
  cautionPayee: boolean;
};

// Airbnb et Booking.com encaissent eux-mêmes le client : jamais "impayé" côté agence.
export function estPrepayeeParPlateforme(canal: string | null): boolean {
  const c = (canal ?? "").toLowerCase();
  return c.includes("airbnb") || c.includes("booking");
}

// Séjour direct en cours, terminé depuis moins de 30 jours ou qui arrive dans les 7 prochains
// jours, dont le montant payé n'atteint pas le loyer.
export function estImpayee(r: ResaPaiement, now: Date): boolean {
  if (estPrepayeeParPlateforme(r.canal)) return false;
  const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
  const paye = r.montantPaye ? Number(r.montantPaye) : 0;
  return (
    loyer > 0 &&
    paye < loyer &&
    new Date(r.checkIn) <= endOfDay(addDays(now, 7)) &&
    new Date(r.checkOut) >= subDays(startOfDay(now), 30)
  );
}

// Séjour qui arrive aujourd'hui ou est en cours, avec une caution prévue pas encore reçue.
export function cautionEnAttente(r: ResaPaiement, now: Date): boolean {
  const montant = r.caution ? Number(r.caution) : 0;
  return montant > 0 && !r.cautionPayee && new Date(r.checkIn) <= endOfDay(now) && new Date(r.checkOut) >= startOfDay(now);
}
