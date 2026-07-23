import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
