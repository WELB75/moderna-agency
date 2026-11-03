// Adresse publique de l'application, celle que les voyageurs, propriétaires et équipes doivent voir
// dans les liens envoyés (fiche police, caution, contrat, bienvenue...). Kamel, 2026-11-03 :
// « je veux plus que tu envoies les URLs moderna vercel, mais superhosts.ma ».
// L'adresse technique moderna-agency.vercel.app continue de fonctionner, mais elle ne doit plus
// sortir de l'app.
export const APP_ORIGIN = "https://admin.superhosts.ma";

// Côté navigateur : l'adresse officielle, sauf en développement local (localhost) où l'on garde
// l'adresse ouverte pour pouvoir tester.
export function originApp(): string {
  if (typeof window === "undefined") return APP_ORIGIN;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" ? window.location.origin : APP_ORIGIN;
}
