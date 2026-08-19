// NEXT_PUBLIC_APP_URL n'est configuré nulle part sur ce projet (vérifié en prod le 2026-08-19) —
// les liens /t/[token] et /i/[id] envoyés par WhatsApp partaient donc en chemin relatif, inutilisables
// une fois collés hors de l'app. VERCEL_URL/VERCEL_PROJECT_PRODUCTION_URL sont fournis
// automatiquement par Vercel, sans configuration, donc préférés en repli.
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return domain ? `https://${domain}` : "";
}
