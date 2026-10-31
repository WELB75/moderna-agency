import type { GendarmerieLang } from "@/lib/gendarmerie-i18n";

// Textes du parcours « voyageur par voyageur » de la fiche police (/g/[id], voir
// components/app/gendarmerie-form-progressif.tsx). Les textes de la carte elle-même (champs,
// scan, signature, enfants) restent dans gendarmerie-i18n.ts.

export type ProgressifText = {
  title: string;
  subtitle: (villaNom: string) => string;
  explication: string;
  howMany: string;
  progress: (recus: number, attendus: number) => string;
  progressSansTotal: (recus: number) => string;
  registered: string;
  myCard: string;
  save: string;
  saving: string;
  savedTitle: (prenom: string) => string;
  missing: (n: number) => string;
  allDone: string;
  alreadyDone: string;
  share: string;
  shareMessage: (villaNom: string, url: string, manquants: number) => string;
  copyLink: string;
  copied: string;
  addAnother: string;
  adjustCount: string;
  adjustValidate: string;
  onePerson: string;
  draftRestored: string;
  nameRequired: string;
  signatureRequired: string;
  childrenSaved: string;
  childrenSave: string;
  conditionsNote: string;
};

export const PROGRESSIF_TEXT: Record<GendarmerieLang, ProgressifText> = {
  fr: {
    title: "Fiche de police (gendarmerie)",
    subtitle: (v) => `Pour votre séjour à ${v}`,
    explication:
      "Chaque adulte du groupe remplit sa propre fiche : scannez votre passeport, vérifiez, signez. Vous pouvez le faire chacun de votre côté, depuis votre propre téléphone : ce qui est enregistré reste enregistré.",
    howMany: "Combien d'adultes dans votre groupe ?",
    progress: (r, a) => `${r} adulte${r > 1 ? "s" : ""} sur ${a} enregistré${r > 1 ? "s" : ""}`,
    progressSansTotal: (r) => `${r} adulte${r > 1 ? "s" : ""} enregistré${r > 1 ? "s" : ""}`,
    registered: "Déjà enregistrés :",
    myCard: "Ma fiche",
    save: "Enregistrer ma fiche",
    saving: "Enregistrement...",
    savedTitle: (p) => `Merci ${p}, votre fiche est enregistrée.`,
    missing: (n) => `Il manque encore ${n} passeport${n > 1 ? "s" : ""}.`,
    allDone: "Tout le monde est enregistré. Merci, à bientôt !",
    alreadyDone: "Cette fiche est complète. Merci !",
    share: "Envoyer le lien aux autres voyageurs",
    shareMessage: (v, url, n) =>
      `Bonjour ! Pour notre séjour à ${v}, chaque adulte doit remplir sa fiche de police (2 minutes : scan du passeport + signature). Il manque encore ${n} personne${n > 1 ? "s" : ""}. C'est ici : ${url}`,
    copyLink: "Copier le lien",
    copied: "Lien copié",
    addAnother: "Ajouter une autre personne depuis ce téléphone",
    adjustCount: "Nous sommes finalement",
    adjustValidate: "Valider",
    onePerson: "Une personne de plus ?",
    draftRestored: "Votre saisie précédente a été restaurée.",
    nameRequired: "Le nom ou le prénom est obligatoire.",
    signatureRequired: "La signature est obligatoire.",
    childrenSaved: "Photos des enfants enregistrées.",
    childrenSave: "Enregistrer les photos des enfants",
    conditionsNote: "Votre signature ci-dessus vaut signature des conditions de séjour pour tout le groupe.",
  },
  en: {
    title: "Police registration form",
    subtitle: (v) => `For your stay at ${v}`,
    explication:
      "Each adult in the group fills in their own form: scan your passport, check, sign. You can each do it separately, from your own phone: whatever is saved stays saved.",
    howMany: "How many adults are in your group?",
    progress: (r, a) => `${r} of ${a} adult${a > 1 ? "s" : ""} registered`,
    progressSansTotal: (r) => `${r} adult${r > 1 ? "s" : ""} registered`,
    registered: "Already registered:",
    myCard: "My form",
    save: "Save my form",
    saving: "Saving...",
    savedTitle: (p) => `Thank you ${p}, your form is saved.`,
    missing: (n) => `${n} passport${n > 1 ? "s" : ""} still missing.`,
    allDone: "Everyone is registered. Thank you, see you soon!",
    alreadyDone: "This form is complete. Thank you!",
    share: "Send the link to the other travellers",
    shareMessage: (v, url, n) =>
      `Hi! For our stay at ${v}, each adult has to fill in their police form (2 minutes: passport scan + signature). ${n} ${n > 1 ? "people are" : "person is"} still missing. Here: ${url}`,
    copyLink: "Copy link",
    copied: "Link copied",
    addAnother: "Add another person from this phone",
    adjustCount: "We are actually",
    adjustValidate: "Confirm",
    onePerson: "One more person?",
    draftRestored: "Your previous entry has been restored.",
    nameRequired: "Last name or first name is required.",
    signatureRequired: "Signature is required.",
    childrenSaved: "Children's photos saved.",
    childrenSave: "Save the children's photos",
    conditionsNote: "Your signature above also signs the terms of stay for the whole group.",
  },
  es: {
    title: "Ficha de policía",
    subtitle: (v) => `Para su estancia en ${v}`,
    explication:
      "Cada adulto del grupo rellena su propia ficha: escanee su pasaporte, compruebe, firme. Pueden hacerlo cada uno por su lado, desde su propio teléfono: lo que se guarda, se queda guardado.",
    howMany: "¿Cuántos adultos hay en su grupo?",
    progress: (r, a) => `${r} de ${a} adulto${a > 1 ? "s" : ""} registrado${r > 1 ? "s" : ""}`,
    progressSansTotal: (r) => `${r} adulto${r > 1 ? "s" : ""} registrado${r > 1 ? "s" : ""}`,
    registered: "Ya registrados:",
    myCard: "Mi ficha",
    save: "Guardar mi ficha",
    saving: "Guardando...",
    savedTitle: (p) => `Gracias ${p}, su ficha está guardada.`,
    missing: (n) => `Falta${n > 1 ? "n" : ""} todavía ${n} pasaporte${n > 1 ? "s" : ""}.`,
    allDone: "Todos están registrados. ¡Gracias, hasta pronto!",
    alreadyDone: "Esta ficha está completa. ¡Gracias!",
    share: "Enviar el enlace a los demás viajeros",
    shareMessage: (v, url, n) =>
      `¡Hola! Para nuestra estancia en ${v}, cada adulto debe rellenar su ficha de policía (2 minutos: escaneo del pasaporte + firma). Falta${n > 1 ? "n" : ""} ${n} persona${n > 1 ? "s" : ""}. Aquí: ${url}`,
    copyLink: "Copiar enlace",
    copied: "Enlace copiado",
    addAnother: "Añadir otra persona desde este teléfono",
    adjustCount: "Al final somos",
    adjustValidate: "Confirmar",
    onePerson: "¿Una persona más?",
    draftRestored: "Se ha restaurado su entrada anterior.",
    nameRequired: "El apellido o el nombre es obligatorio.",
    signatureRequired: "La firma es obligatoria.",
    childrenSaved: "Fotos de los niños guardadas.",
    childrenSave: "Guardar las fotos de los niños",
    conditionsNote: "Su firma de arriba vale también como firma de las condiciones de estancia para todo el grupo.",
  },
  ar: {
    title: "بطاقة الشرطة",
    subtitle: (v) => `لإقامتكم في ${v}`,
    explication:
      "يملأ كل شخص بالغ في المجموعة بطاقته الخاصة: امسح جواز سفرك، تحقق، ثم وقّع. يمكن لكل واحد فعل ذلك من هاتفه الخاص: ما تم حفظه يبقى محفوظًا.",
    howMany: "كم عدد البالغين في مجموعتكم؟",
    progress: (r, a) => `تم تسجيل ${r} من ${a} بالغين`,
    progressSansTotal: (r) => `تم تسجيل ${r} بالغين`,
    registered: "المسجلون:",
    myCard: "بطاقتي",
    save: "حفظ بطاقتي",
    saving: "جارٍ الحفظ...",
    savedTitle: (p) => `شكرًا ${p}، تم حفظ بطاقتك.`,
    missing: (n) => `لا يزال ينقص ${n} جواز سفر.`,
    allDone: "تم تسجيل الجميع. شكرًا، إلى اللقاء!",
    alreadyDone: "هذه البطاقة مكتملة. شكرًا!",
    share: "إرسال الرابط إلى بقية المسافرين",
    shareMessage: (v, url, n) =>
      `مرحبًا! لإقامتنا في ${v}، يجب على كل بالغ ملء بطاقة الشرطة الخاصة به (دقيقتان: مسح جواز السفر + توقيع). لا يزال ينقص ${n} شخص. الرابط: ${url}`,
    copyLink: "نسخ الرابط",
    copied: "تم نسخ الرابط",
    addAnother: "إضافة شخص آخر من هذا الهاتف",
    adjustCount: "عددنا في النهاية",
    adjustValidate: "تأكيد",
    onePerson: "شخص إضافي؟",
    draftRestored: "تمت استعادة ما أدخلته سابقًا.",
    nameRequired: "الاسم أو اللقب إلزامي.",
    signatureRequired: "التوقيع إلزامي.",
    childrenSaved: "تم حفظ صور الأطفال.",
    childrenSave: "حفظ صور الأطفال",
    conditionsNote: "توقيعك أعلاه يُعدّ توقيعًا على شروط الإقامة باسم المجموعة كلها.",
  },
  nl: {
    title: "Politieformulier",
    subtitle: (v) => `Voor uw verblijf in ${v}`,
    explication:
      "Elke volwassene in de groep vult zijn eigen formulier in: scan uw paspoort, controleer, onderteken. Ieder kan dit apart doen, vanaf de eigen telefoon: wat is opgeslagen, blijft opgeslagen.",
    howMany: "Hoeveel volwassenen telt uw groep?",
    progress: (r, a) => `${r} van ${a} volwassene${a > 1 ? "n" : ""} geregistreerd`,
    progressSansTotal: (r) => `${r} volwassene${r > 1 ? "n" : ""} geregistreerd`,
    registered: "Al geregistreerd:",
    myCard: "Mijn formulier",
    save: "Mijn formulier opslaan",
    saving: "Opslaan...",
    savedTitle: (p) => `Bedankt ${p}, uw formulier is opgeslagen.`,
    missing: (n) => `Er ontbreekt nog ${n} paspoort${n > 1 ? "en" : ""}.`,
    allDone: "Iedereen is geregistreerd. Bedankt, tot binnenkort!",
    alreadyDone: "Dit formulier is volledig. Bedankt!",
    share: "Stuur de link naar de andere reizigers",
    shareMessage: (v, url, n) =>
      `Hallo! Voor ons verblijf in ${v} moet elke volwassene zijn politieformulier invullen (2 minuten: paspoort scannen + handtekening). Er ontbreekt nog ${n} perso${n > 1 ? "nen" : "on"}. Hier: ${url}`,
    copyLink: "Link kopiëren",
    copied: "Link gekopieerd",
    addAnother: "Nog iemand toevoegen vanaf deze telefoon",
    adjustCount: "We zijn uiteindelijk met",
    adjustValidate: "Bevestigen",
    onePerson: "Nog een persoon?",
    draftRestored: "Uw eerdere invoer is hersteld.",
    nameRequired: "Achternaam of voornaam is verplicht.",
    signatureRequired: "Handtekening is verplicht.",
    childrenSaved: "Foto's van de kinderen opgeslagen.",
    childrenSave: "Foto's van de kinderen opslaan",
    conditionsNote: "Uw handtekening hierboven geldt ook als ondertekening van de verblijfsvoorwaarden voor de hele groep.",
  },
};
