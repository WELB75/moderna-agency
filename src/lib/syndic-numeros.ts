// Numéros WhatsApp du syndic / de la sécurité d'une résidence. Un logement peut en avoir
// plusieurs (stockés séparés par une virgule dans syndic_logements.whatsapp) : si l'un ne répond
// pas, on envoie le dossier à l'autre depuis l'app.

// Kamel, 2026-10-22 : « trois numéros, pour tous les appartements cosy sauf Amal cosy ; si l'un
// échoue on envoie à l'autre ». Repris tant qu'un appartement n'a pas ses propres numéros ;
// Amal cosy a le sien (enregistré dans sa fiche syndic). Le troisième est « Sécurité Nuit », qui
// est bien le syndic.
export const NUMEROS_SYNDIC_PAR_DEFAUT = ["+212626453145", "+212664182876", "+212649455430"];

function nettoyer(numero: string): string {
  return numero.replace(/[^\d+]/g, "");
}

export function parserNumerosSyndic(brut: string | null | undefined): string[] {
  return (brut ?? "")
    .split(/[,;\n]/)
    .map(nettoyer)
    .filter((n) => n.replace(/\D/g, "").length >= 9);
}

export function normaliserNumerosSyndic(brut: string): string | null {
  const numeros = parserNumerosSyndic(brut);
  return numeros.length ? numeros.join(",") : null;
}

// Numéros proposés pour l'envoi : ceux du logement, sinon la liste par défaut.
export function numerosPourEnvoi(brut: string | null | undefined): string[] {
  const propres = parserNumerosSyndic(brut);
  return propres.length ? propres : NUMEROS_SYNDIC_PAR_DEFAUT;
}

export function formaterNumero(numero: string): string {
  const m = numero.match(/^\+212(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+212 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : numero;
}
