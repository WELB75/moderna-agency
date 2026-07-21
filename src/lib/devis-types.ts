export type DevisLigne = {
  description: string;
  prix: string; // texte libre (ex. "480") pour rester simple, affiché avec la devise du devis
};

export type Devis = {
  titre: string;
  prestataireNom: string;
  prestataireTelephone: string;
  prestataireSite: string;
  prestataireEmail: string;
  prestataireInstagram: string;
  prestataireFacebook: string;
  prestataireAdresse: string;
  devise: string;
  lignes: DevisLigne[];
  totalOverride: string; // texte libre si le total n'est pas la simple somme des lignes
  note: string;
  createdAt: string;
};

export function emptyDevis(): Devis {
  return {
    titre: "",
    prestataireNom: "",
    prestataireTelephone: "",
    prestataireSite: "",
    prestataireEmail: "",
    prestataireInstagram: "",
    prestataireFacebook: "",
    prestataireAdresse: "",
    devise: "DH",
    lignes: [{ description: "", prix: "" }],
    totalOverride: "",
    note: "",
    createdAt: new Date().toISOString(),
  };
}

export function devisTotal(devis: Devis): number {
  return devis.lignes.reduce((sum, l) => sum + (Number(l.prix) || 0), 0);
}
