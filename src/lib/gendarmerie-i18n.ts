export type GendarmerieLang = "fr" | "en" | "es" | "ar";

export const LANG_LABELS: Record<GendarmerieLang, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  ar: "العربية",
};

export const FIELD_KEYS = [
  "nom",
  "prenom",
  "dateNaissance",
  "lieuNaissance",
  "nationalite",
  "profession",
  "venantDe",
  "allantA",
  "dateArrivee",
  "domicileHabituel",
  "typePiece",
  "numeroPiece",
  "datePiece",
  "lieuPiece",
  "signatureNom",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

// Champs à afficher avec un vrai calendrier (input type="date") plutôt qu'en texte libre.
export const DATE_FIELD_KEYS: readonly FieldKey[] = ["dateNaissance", "dateArrivee", "datePiece"];

export const FIELD_LABELS: Record<GendarmerieLang, Record<FieldKey, string>> = {
  fr: {
    nom: "Nom",
    prenom: "Prénom",
    dateNaissance: "Date de naissance",
    lieuNaissance: "Lieu de naissance",
    nationalite: "Nationalité",
    profession: "Profession",
    venantDe: "Venant de",
    allantA: "Allant à",
    dateArrivee: "Date d'arrivée",
    domicileHabituel: "Domicile habituel",
    typePiece: "Nature de la pièce d'identité (passeport, CIN...)",
    numeroPiece: "Numéro de la pièce",
    datePiece: "Date de délivrance",
    lieuPiece: "Lieu de délivrance",
    signatureNom: "Nom complet (tapé pour valoir signature)",
  },
  en: {
    nom: "Surname",
    prenom: "First name",
    dateNaissance: "Date of birth",
    lieuNaissance: "Place of birth",
    nationalite: "Nationality",
    profession: "Profession",
    venantDe: "Coming from",
    allantA: "Going to",
    dateArrivee: "Date of arrival",
    domicileHabituel: "Home address",
    typePiece: "Identity document (passport, ID card...)",
    numeroPiece: "Document number",
    datePiece: "Date of delivery",
    lieuPiece: "Place of delivery",
    signatureNom: "Full name (typed as signature)",
  },
  es: {
    nom: "Apellido",
    prenom: "Nombre",
    dateNaissance: "Fecha de nacimiento",
    lieuNaissance: "Lugar de nacimiento",
    nationalite: "Nacionalidad",
    profession: "Profesión",
    venantDe: "Procedente de",
    allantA: "Con destinación a",
    dateArrivee: "Fecha de llegada",
    domicileHabituel: "Domicilio actual",
    typePiece: "Documento de identidad (pasaporte, DNI...)",
    numeroPiece: "Número del documento",
    datePiece: "Fecha de expedición",
    lieuPiece: "Lugar de expedición",
    signatureNom: "Nombre completo (como firma)",
  },
  ar: {
    nom: "الاسم العائلي",
    prenom: "الاسم الشخصي",
    dateNaissance: "تاريخ الازدياد",
    lieuNaissance: "محل الازدياد",
    nationalite: "الجنسية",
    profession: "المهنة",
    venantDe: "قادم من",
    allantA: "ذاهب الى",
    dateArrivee: "تاريخ الوصول",
    domicileHabituel: "محل السكنى",
    typePiece: "نوع وثيقة الهوية (جواز السفر، البطاقة الوطنية...)",
    numeroPiece: "رقم الوثيقة",
    datePiece: "تاريخ التسليم",
    lieuPiece: "محل التسليم",
    signatureNom: "الاسم الكامل (بمثابة إمضاء)",
  },
};

export const UI_TEXT: Record<
  GendarmerieLang,
  {
    title: string;
    subtitle: (villaNom: string) => string;
    chooseLang: string;
    occupant: string;
    addOccupant: string;
    removeOccupant: string;
    submit: string;
    submitting: string;
    success: string;
    already: string;
    signature: string;
    signatureClear: string;
    photoPiece: string;
  }
> = {
  fr: {
    title: "Fiche de police (gendarmerie)",
    subtitle: (v) => `À remplir par chaque adulte pour votre séjour à ${v}`,
    chooseLang: "Choisissez votre langue",
    occupant: "Occupant",
    addOccupant: "Ajouter un occupant",
    removeOccupant: "Retirer",
    submit: "Envoyer",
    submitting: "Envoi...",
    success: "Merci, vos informations ont bien été transmises.",
    already: "Ce formulaire a déjà été rempli. Merci.",
    signature: "Signature (avec le doigt ou la souris)",
    signatureClear: "Effacer",
    photoPiece: "Photo de votre pièce d'identité (passeport, CIN...)",
  },
  en: {
    title: "Police registration form",
    subtitle: (v) => `To be filled in by every adult for your stay at ${v}`,
    chooseLang: "Choose your language",
    occupant: "Occupant",
    addOccupant: "Add an occupant",
    removeOccupant: "Remove",
    submit: "Submit",
    submitting: "Sending...",
    success: "Thank you, your information has been submitted.",
    already: "This form has already been submitted. Thank you.",
    signature: "Signature (finger or mouse)",
    signatureClear: "Clear",
    photoPiece: "Photo of your ID (passport, national ID...)",
  },
  es: {
    title: "Ficha de policía",
    subtitle: (v) => `A rellenar por cada adulto para su estancia en ${v}`,
    chooseLang: "Elige tu idioma",
    occupant: "Ocupante",
    addOccupant: "Añadir un ocupante",
    removeOccupant: "Quitar",
    submit: "Enviar",
    submitting: "Enviando...",
    success: "Gracias, tu información ha sido enviada.",
    already: "Este formulario ya ha sido completado. Gracias.",
    signature: "Firma (con el dedo o el ratón)",
    signatureClear: "Borrar",
    photoPiece: "Foto de tu documento de identidad (pasaporte, DNI...)",
  },
  ar: {
    title: "ورقة شخصية (الشرطة)",
    subtitle: (v) => `يجب أن يملأها كل بالغ من أجل إقامتكم في ${v}`,
    chooseLang: "اختر لغتك",
    occupant: "شخص",
    addOccupant: "إضافة شخص",
    removeOccupant: "إزالة",
    submit: "إرسال",
    submitting: "جارٍ الإرسال...",
    success: "شكرا، تم إرسال معلوماتك بنجاح.",
    already: "تم ملء هذه الورقة بالفعل. شكرا.",
    signature: "التوقيع (بالإصبع أو الفأرة)",
    signatureClear: "مسح",
    photoPiece: "صورة وثيقة هويتك (جواز السفر، البطاقة الوطنية...)",
  },
};

export function emptyOccupant() {
  return {
    nom: "",
    prenom: "",
    dateNaissance: "",
    lieuNaissance: "",
    nationalite: "",
    profession: "",
    venantDe: "",
    allantA: "",
    dateArrivee: "",
    domicileHabituel: "",
    typePiece: "",
    numeroPiece: "",
    datePiece: "",
    lieuPiece: "",
    signatureNom: "",
    signatureImage: "",
    photoPieceUrl: "",
  };
}
