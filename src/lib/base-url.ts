import { APP_ORIGIN } from "@/lib/app-origin";

// Adresse de base des liens envoyés par le serveur (WhatsApp, Beds24, Stripe...). En production c'est
// toujours l'adresse officielle superhosts.ma : VERCEL_PROJECT_PRODUCTION_URL donnait
// moderna-agency.vercel.app (NEXT_PUBLIC_APP_URL n'est pas défini). Hors production (aperçus de
// branche), on garde l'adresse du déploiement pour pouvoir tester.
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_ENV === "production") return APP_ORIGIN;
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return domain ? `https://${domain}` : "";
}
