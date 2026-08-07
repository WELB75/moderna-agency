import { createWorker } from "tesseract.js";

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

// Partagé entre passport-ocr.ts (lecture MRZ) et id-photo-normalize.ts (détection du sens de
// rotation) : un seul worker Tesseract initialisé et mis en cache, plutôt qu'un par usage.
export function getOcrWorker() {
  // cachePath par défaut = dossier courant, en lecture seule sur Vercel — /tmp est le seul
  // dossier inscriptible en prod, et permet de vraiment mettre en cache les traineddata entre
  // deux invocations d'une même fonction "chaude" plutôt que de les re-télécharger à chaque fois.
  if (!ocrWorkerPromise) ocrWorkerPromise = createWorker("eng", undefined, { cachePath: "/tmp" });
  return ocrWorkerPromise;
}
