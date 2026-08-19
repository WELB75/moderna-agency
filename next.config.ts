import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp (recadrage/normalisation des photos passeport) doit rester un module natif chargé par
  // Node, pas bundlé — bundlé, Turbopack duplique la classe URL interne et "sharp" plante avec
  // "Received an instance of URL" dès qu'un nouveau chemin serveur (ex. création d'intervention
  // maintenance) l'importe pour la première fois. Vu en prod le 2026-08-19 sur POST /maintenance.
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    // La fiche police/gendarmerie envoie plusieurs photos (passeports + signatures) en un seul
    // appel de Server Action quand plusieurs adultes/enfants sont sur le même lien groupé —
    // ça dépasse vite la limite par défaut de 1 Mo.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
