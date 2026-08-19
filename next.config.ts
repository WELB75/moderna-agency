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
  // Crash récurrent "ERR_DLOPEN_FAILED: libvips-cpp.so ... cannot open shared object file" sur
  // /documents, /securite, etc. : le traçage de fichiers de Next.js ne détecte pas que le
  // binaire natif de sharp (dans @img/sharp-linux-x64 / @img/sharp-libvips-linux-x64) est
  // nécessaire au runtime — bug connu de sharp+Vercel, PAS un problème de scripts npm bloqués
  // (la tentative précédente via allowScripts dans package.json était inerte, aucun outil ne
  // la consomme). Kamel, 2026-08-19. Un essai antérieur avec serverExternalPackages: ["sharp"]
  // avait aussi été tenté puis annulé (ça cassait le bundling Turbopack des Server Actions
  // différemment) — outputFileTracingIncludes est la solution ciblée : force l'inclusion du
  // binaire dans le bundle serverless sans externaliser tout le package.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/sharp-libvips-linux-x64/**", "./node_modules/@img/sharp-linux-x64/**"],
  },
};

export default nextConfig;
