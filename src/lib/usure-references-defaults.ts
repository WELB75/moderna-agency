export const DEFAULT_USURE_REFERENCES: {
  typeObjet: string;
  dureeVieAttendueMois: number;
  criteres: string;
}[] = [
  {
    typeObjet: "Literie / linge de maison",
    dureeVieAttendueMois: 24,
    criteres: "Usure : décoloration légère, boulochage. Dégât : trous, brûlures, taches indélébiles (encre, vin, sang), déchirures.",
  },
  {
    typeObjet: "Peinture / murs",
    dureeVieAttendueMois: 60,
    criteres: "Usure : légers frottements, marques de meubles. Dégât : trous, traces de feutre/marqueur, moisissure due à un défaut d'entretien du locataire.",
  },
  {
    typeObjet: "Électroménager",
    dureeVieAttendueMois: 96,
    criteres: "Usure : ralentissement, bruit léger avec l'âge. Dégât : casse suite à mauvaise manipulation, pièce manquante, appareil ne s'allume plus après un usage normal.",
  },
  {
    typeObjet: "Mobilier intérieur",
    dureeVieAttendueMois: 60,
    criteres: "Usure : affaissement d'un canapé, patine du bois. Dégât : pied cassé, tissu déchiré/taché, brûlure de cigarette.",
  },
  {
    typeObjet: "Mobilier extérieur",
    dureeVieAttendueMois: 48,
    criteres: "Usure : décoloration due au soleil, rouille légère. Dégât : structure cassée, coussins déchirés, parasol arraché.",
  },
  {
    typeObjet: "Plomberie / sanitaire",
    dureeVieAttendueMois: 84,
    criteres: "Usure : joints à refaire, tartre. Dégât : robinetterie cassée, fuite causée par un objet jeté dans les toilettes, faïence fissurée.",
  },
  {
    typeObjet: "Piscine",
    dureeVieAttendueMois: 36,
    criteres: "Usure : eau trouble ponctuelle, liner qui se décolore. Dégât : liner déchiré, matériel de filtration cassé, sécurité (barrière/alarme) endommagée.",
  },
  {
    typeObjet: "Électronique (TV, wifi...)",
    dureeVieAttendueMois: 48,
    criteres: "Usure : lenteur, obsolescence. Dégât : écran fissuré, télécommande/câbles manquants, appareil ne s'allume plus sans raison technique connue.",
  },
];
