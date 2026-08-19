const DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/;

// Accepte aussi bien une data URL (le format produit par les formulaires de l'app) qu'une URL
// http(s) (ex. Vercel Blob) — certaines fiches sont pré-remplies hors de ces formulaires
// (photos reçues par Kamel sur WhatsApp, uploadées à part) et arrivent déjà sous forme de lien
// plutôt que de data URL. Retourne null si le lien est mort/inaccessible, plutôt que de bloquer
// l'appelant (import à froid, sans savoir si le lien est encore valide).
//
// Volontairement séparé de id-photo-normalize.ts (qui importe "sharp") : cette fonction n'a pas
// besoin de sharp, et un appelant qui n'a besoin QUE de récupérer un buffer (ex. le matcher de
// technicien maintenance, qui envoie l'image telle quelle à la vision Claude) ne doit pas tirer
// sharp dans son bundle serveur — vu en prod le 2026-08-19 : ce nouvel import a cassé Turbopack
// avec "Received an instance of URL" sur POST /maintenance.
export async function loadImageBuffer(urlOrDataUrl: string): Promise<Buffer | null> {
  const match = DATA_URL_RE.exec(urlOrDataUrl);
  if (match) return Buffer.from(match[1], "base64");
  if (/^https?:\/\//.test(urlOrDataUrl)) {
    const res = await fetch(urlOrDataUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}
