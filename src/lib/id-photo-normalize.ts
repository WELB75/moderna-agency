import sharp from "sharp";
import { loadImageBuffer } from "@/lib/fetch-image-buffer";

export { loadImageBuffer };

const MAX_STORED_DIMENSION = 1400;

// Recadre les bords uniformes (table, fond, chrome d'appli sur une capture d'écran...) et
// ramène à une taille/encodage cohérents. Ne touche PAS à la rotation : deux tentatives de
// détection automatique du sens de lecture (par géométrie du cadre, puis par confiance OCR sur
// les 4 rotations) se sont révélées peu fiables sur des sources réelles (captures d'écran
// WhatsApp multi-couches notamment) et ont produit des têtes à l'envers — sur des passeports
// réels, mieux vaut laisser l'orientation d'origine que de deviner faux. Le sens de lecture
// correct doit être fixé à la main par qui capture/importe la photo (voir les boutons de
// rotation dans PassportDropZone et IdPhotoCapture).
export async function normalizeIdPhotoBuffer(inputBuffer: Buffer): Promise<Buffer> {
  const upright = await sharp(inputBuffer).rotate().toBuffer(); // respecte l'EXIF

  let trimmed: Buffer;
  try {
    trimmed = await sharp(upright).trim({ threshold: 15 }).toBuffer();
  } catch {
    trimmed = upright; // bords pas assez uniformes pour être recadrés : on garde l'image telle quelle
  }

  return sharp(trimmed)
    .resize({ width: MAX_STORED_DIMENSION, height: MAX_STORED_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function normalizeIdPhotoDataUrl(urlOrDataUrl: string): Promise<string> {
  const inputBuffer = await loadImageBuffer(urlOrDataUrl);
  if (!inputBuffer) return urlOrDataUrl; // ni data URL ni lien accessible reconnu : inchangé

  const outputBuffer = await normalizeIdPhotoBuffer(inputBuffer);
  return `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
}
