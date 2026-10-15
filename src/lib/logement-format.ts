// "?" ou vide en base (certains appartements Noria) : pas de numéro à afficher.
export function numeroAffichable(numero: string | null | undefined): string | null {
  const n = (numero ?? "").trim();
  return n && n !== "?" && n !== "-" ? n : null;
}

// "Villa Tania (n°3)", "Jade Cosy" (sans numéro connu) — libellé court d'un logement.
export function libelleLogement(nom: string, numero: string | null | undefined): string {
  const n = numeroAffichable(numero);
  return n ? `${nom} (n°${n})` : nom;
}
