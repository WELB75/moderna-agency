import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { parse as parseMrz } from "mrz";
import { nationaliteFromCode } from "@/lib/nationalites";

// Lecture de passeport 100% locale (pas d'API IA payante) : on ne tente pas de lire les champs
// imprimés (mise en page différente dans chaque pays, peu fiable en OCR générique) mais
// uniquement la MRZ — la bande de deux lignes en bas de la page bio, normée ICAO 9303 donc
// identique dans le monde entier, avec chiffres de contrôle qui permettent de vérifier la
// lecture. Comme on ne sait pas à l'avance dans quel sens la photo a été prise (les téléphones
// ne mettent pas toujours de tag EXIF, cf. les passeports pris de travers du 31/07), on essaie
// les 4 rotations possibles et on garde celle dont la MRZ passe la validation. Le lieu de
// naissance, la profession et le lieu de délivrance ne sont pas dans la MRZ et restent à
// compléter à la main dans l'écran de relecture.

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

function getOcrWorker() {
  // cachePath par défaut = dossier courant, en lecture seule sur Vercel — /tmp est le seul
  // dossier inscriptible en prod, et permet de vraiment mettre en cache les traineddata entre
  // deux invocations d'une même fonction "chaude" plutôt que de les re-télécharger à chaque fois.
  if (!ocrWorkerPromise) ocrWorkerPromise = createWorker("eng", undefined, { cachePath: "/tmp" });
  return ocrWorkerPromise;
}

const MAX_STORED_DIMENSION = 1400; // même convention que IdPhotoCapture (upload manuel côté client)
const MRZ_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
const ROTATIONS = [0, 90, 180, 270] as const;

export type PassportField = {
  nom: string;
  prenom: string;
  dateNaissance: string; // YYYY-MM-DD
  nationalite: string;
  venantDe: string;
  typePiece: string;
  numeroPiece: string;
};

export type PassportExtraction = {
  fields: Partial<PassportField>;
  photoDataUrl: string;
  mrzFound: boolean;
  mrzValid: boolean;
  warnings: string[];
};

function mrzDateToIso(yymmdd: string, kind: "birth" | "expiry"): string | null {
  if (!/^[0-9]{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const currentYy = new Date().getFullYear() % 100;
  const century = kind === "expiry" ? 2000 : yy > currentYy ? 1900 : 2000;
  const year = century + yy;
  return `${year}-${mm}-${dd}`;
}

// Nettoie une ligne OCR candidate pour la MRZ : la police OCR-B n'a que des lettres
// majuscules, chiffres et "<", donc tout le reste vient d'une erreur de lecture.
function cleanMrzLine(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  const cleaned = upper.replace(/[^A-Z0-9<]/g, "<");
  return cleaned.slice(0, 44).padEnd(44, "<");
}

// Score une tentative de lecture MRZ : le nombre de champs que la lib `mrz` juge valides
// (avec chiffres de contrôle corrects) — bien plus fiable que compter les caractères lus,
// qui peut être trompé par du bruit OCR qui "ressemble" à de la MRZ sans en être.
function scoreMrzAttempt(lines: [string, string]): { score: number; result: ReturnType<typeof parseMrz> | null } {
  try {
    const result = parseMrz(lines, { autocorrect: true });
    const validFields = result.details.filter((d) => d.field && d.valid).length;
    return { score: result.format === "TD3" ? validFields + (result.valid ? 10 : 0) : 0, result };
  } catch {
    return { score: 0, result: null };
  }
}

async function ocrMrzStrip(worker: Awaited<ReturnType<typeof createWorker>>, rotatedBuffer: Buffer): Promise<[string, string] | null> {
  const meta = await sharp(rotatedBuffer).metadata();
  if (!meta.width || !meta.height) return null;
  // La MRZ est toujours tout en bas de la page bio ; on prend une bande large (30%) pour
  // rester robuste même si le cadrage de la photo n'est pas parfait.
  const stripTop = Math.round(meta.height * 0.7);
  const strip = await sharp(rotatedBuffer)
    .extract({ left: 0, top: stripTop, width: meta.width, height: meta.height - stripTop })
    .resize({ width: meta.width * 2 })
    .grayscale()
    .normalize()
    .threshold(150)
    .toBuffer();

  await worker.setParameters({ tessedit_char_whitelist: MRZ_CHARSET, tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(strip);
  const candidates = data.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.replace(/\s+/g, "").length >= 20);
  if (candidates.length < 2) return null;
  const last2 = candidates.slice(-2);
  return [cleanMrzLine(last2[0]), cleanMrzLine(last2[1])];
}

export async function extractPassport(inputBuffer: Buffer): Promise<PassportExtraction> {
  const warnings: string[] = [];

  // Respecte d'abord un éventuel tag EXIF d'orientation (photos iPhone/Android récentes).
  const base: Buffer = await sharp(inputBuffer).rotate().toBuffer();

  const worker = await getOcrWorker();

  let best: { angle: number; score: number; result: ReturnType<typeof parseMrz> | null; rotatedBuffer: Buffer } | null = null;
  for (const angle of ROTATIONS) {
    const rotatedBuffer: Buffer = angle === 0 ? base : await sharp(base).rotate(angle).toBuffer();
    const lines = await ocrMrzStrip(worker, rotatedBuffer);
    if (!lines) continue;
    const { score, result } = scoreMrzAttempt(lines);
    if (!best || score > best.score) best = { angle, score, result, rotatedBuffer };
  }

  const fields: Partial<PassportField> = {};
  let mrzFound = false;
  let mrzValid = false;
  let correctedBuffer = base;

  if (best && best.result && best.score > 0) {
    correctedBuffer = best.rotatedBuffer;
    mrzFound = true;
    mrzValid = best.result.valid;
    if (!best.result.valid) warnings.push("MRZ lue mais certains champs semblent incorrects (photo penchée/floue ?) — à vérifier.");

    const f = best.result.fields;
    if (f.lastName) fields.nom = f.lastName;
    if (f.firstName) fields.prenom = f.firstName;
    if (f.birthDate) fields.dateNaissance = mrzDateToIso(f.birthDate, "birth") ?? undefined;
    if (f.documentNumber) fields.numeroPiece = f.documentNumber;
    fields.typePiece = "Passeport";

    const nat = nationaliteFromCode(f.nationality);
    if (nat) {
      fields.nationalite = nat.nationalite;
      fields.venantDe = nat.pays;
    } else if (f.nationality) {
      warnings.push(`Nationalité "${f.nationality}" non reconnue — à compléter à la main.`);
    }
  } else {
    warnings.push("Zone MRZ (bas de la page passeport) non lue avec certitude — remplis les champs à la main.");
  }

  const outputBuffer = await sharp(correctedBuffer)
    .resize({ width: MAX_STORED_DIMENSION, height: MAX_STORED_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  return {
    fields,
    photoDataUrl: `data:image/jpeg;base64,${outputBuffer.toString("base64")}`,
    mrzFound,
    mrzValid,
    warnings,
  };
}
