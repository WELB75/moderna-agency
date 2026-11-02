import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { enGB, fr } from "date-fns/locale";
import { Building2, CheckCircle2, ChevronDown, Clock, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Logo, Wordmark } from "@/components/app/logo";
import { enregistrerSessionTerminee, etatPageCaution, type ContexteCaution } from "@/lib/caution/service";
import { formatEuros, JOURS_AVANT_LEVEE_AUTO } from "@/lib/caution/regles";
import { stripeConfigure } from "@/lib/caution/stripe";
import { demarrerCaution } from "./actions";
import { CautionBouton } from "./caution-bouton";

// Page publique de caution envoyée dans le message Beds24 (Booking.com et Direct) :
// /caution/[n° de réservation]. Elle n'affiche que le prénom, le logement, les dates et le
// montant ; la carte est saisie sur la page Stripe, jamais ici.
export const metadata: Metadata = { title: "Caution du séjour · Superhosts", robots: { index: false, follow: false } };

type Lang = "fr" | "en";

const TEXTES = {
  fr: {
    titre: "Caution du séjour",
    securise: "Paiement sécurisé par Stripe",
    bonjour: (p: string) => (p ? `Bonjour ${p}, votre séjour approche !` : "Bonjour, votre séjour approche !"),
    intro: "Pour finaliser votre arrivée, nous vous demandons une caution.",
    introFort: "Aucun montant n'est débité",
    introSuite: " : la somme est simplement réservée sur votre carte, puis libérée après votre départ.",
    nuits: (n: number) => `${n} nuit${n > 1 ? "s" : ""}`,
    montant: "Caution (empreinte bancaire)",
    badge: `Non débité · libéré au plus tard ${JOURS_AVANT_LEVEE_AUTO} jours après le départ`,
    commentTitre: "Comment ça marche",
    etapes: [
      { titre: "Vous enregistrez votre carte", texte: "Sur la page sécurisée de Stripe, votre banque bloque temporairement le montant, sans le prélever." },
      { titre: "Vous profitez de votre séjour", texte: "Rien ne change pour vous. Pour un séjour de plus d'une semaine, l'empreinte est renouvelée automatiquement sur la même carte." },
      { titre: "Le blocage est levé", texte: "Après l'état des lieux de sortie, nous libérons la caution. Selon votre banque, le montant redevient disponible sous quelques jours." },
    ],
    faqTitre: "Questions fréquentes",
    faq: [
      { q: "Est-ce que de l'argent est prélevé ?", r: "Non. Il s'agit d'une pré-autorisation : le montant est réservé mais reste sur votre compte. Il n'est prélevé qu'en cas de dommage constaté, toujours après échange avec vous." },
      { q: "Mes données bancaires sont-elles en sécurité ?", r: "Votre carte est saisie directement sur la page de Stripe, certifié PCI-DSS niveau 1. Superhosts ne voit ni ne conserve jamais votre numéro de carte." },
      { q: "Quand la caution est-elle libérée ?", r: `Après l'état des lieux de sortie, et au plus tard ${JOURS_AVANT_LEVEE_AUTO} jours après votre départ. Le délai d'affichage sur votre relevé dépend ensuite de votre banque.` },
      { q: "Et en cas de dommage ?", r: "Nous vous contactons, photos à l'appui, avant tout prélèvement. Seul le montant correspondant est prélevé, le reste est libéré." },
    ],
    carteTitre: "Enregistrer ma caution",
    consentement: (m: string) => `J'autorise Superhosts à bloquer ${m} sur ma carte à titre de caution, conformément au contrat de location.`,
    bouton: (m: string) => `Bloquer ${m} (non débité)`,
    boutonEnCours: "Redirection vers Stripe…",
    redirection: "Vous allez être redirigé vers la page sécurisée de Stripe pour saisir votre carte. Validation possible via votre application bancaire (3D Secure).",
    okTitre: "Caution enregistrée",
    okTexte: "Merci, votre empreinte bancaire est bien enregistrée. Vous n'avez plus rien à faire : bon séjour !",
    attenteTitre: "Validation en cours",
    attenteTexte: "Votre banque finalise l'empreinte. Rechargez cette page dans quelques instants ; si le message persiste, contactez-nous sur WhatsApp.",
    annule: "L'enregistrement a été interrompu. Aucun montant n'a été débité : vous pouvez réessayer quand vous voulez.",
    erreur: "Une erreur est survenue, aucun montant n'a été débité. Merci de réessayer dans quelques minutes ou de nous écrire sur WhatsApp.",
    introuvableTitre: "Lien introuvable",
    introuvableTexte: "Nous ne retrouvons pas cette réservation. Vérifiez le lien reçu ou contactez-nous sur WhatsApp.",
    airbnb: "Votre réservation Airbnb ne nécessite pas de caution de notre part : rien à faire ici.",
    annulee: "Cette réservation est annulée : aucune caution n'est demandée.",
    terminee: "Ce séjour est terminé : aucune caution n'est plus demandée.",
    question: "Une question ?",
    contact: "Écrire à l'équipe sur WhatsApp",
    autreLangue: "English",
    pied: "Superhosts · Conciergerie à Marrakech · superhosts.ma",
  },
  en: {
    titre: "Stay security deposit",
    securise: "Secure payment by Stripe",
    bonjour: (p: string) => (p ? `Hello ${p}, your stay is coming up!` : "Hello, your stay is coming up!"),
    intro: "To finalise your arrival, we ask you for a security deposit.",
    introFort: "Nothing is charged",
    introSuite: ": the amount is simply held on your card, then released after your departure.",
    nuits: (n: number) => `${n} night${n > 1 ? "s" : ""}`,
    montant: "Deposit (card hold)",
    badge: `Not charged · released at the latest ${JOURS_AVANT_LEVEE_AUTO} days after check-out`,
    commentTitre: "How it works",
    etapes: [
      { titre: "You register your card", texte: "On Stripe's secure page, your bank temporarily holds the amount without charging it." },
      { titre: "You enjoy your stay", texte: "Nothing changes for you. For stays longer than a week, the hold is renewed automatically on the same card." },
      { titre: "The hold is released", texte: "After the check-out inspection, we release the deposit. Depending on your bank, the amount is available again within a few days." },
    ],
    faqTitre: "Frequently asked questions",
    faq: [
      { q: "Is any money taken?", r: "No. This is a pre-authorisation: the amount is held but stays in your account. It is only charged if damage is found, always after discussing it with you." },
      { q: "Is my card data safe?", r: "Your card is entered directly on Stripe's page, certified PCI-DSS level 1. Superhosts never sees or stores your card number." },
      { q: "When is the deposit released?", r: `After the check-out inspection, and at the latest ${JOURS_AVANT_LEVEE_AUTO} days after your departure. How fast it shows on your statement then depends on your bank.` },
      { q: "What if something is damaged?", r: "We contact you with photos before any charge. Only the corresponding amount is charged, the rest is released." },
    ],
    carteTitre: "Register my deposit",
    consentement: (m: string) => `I authorise Superhosts to hold ${m} on my card as a security deposit, in accordance with the rental agreement.`,
    bouton: (m: string) => `Hold ${m} (not charged)`,
    boutonEnCours: "Redirecting to Stripe…",
    redirection: "You will be redirected to Stripe's secure page to enter your card. You may be asked to confirm in your banking app (3D Secure).",
    okTitre: "Deposit registered",
    okTexte: "Thank you, your card pre-authorisation is registered. There is nothing else to do: enjoy your stay!",
    attenteTitre: "Validation in progress",
    attenteTexte: "Your bank is finalising the hold. Please reload this page in a few moments; if this message stays, contact us on WhatsApp.",
    annule: "The registration was interrupted. Nothing has been charged: you can try again at any time.",
    erreur: "Something went wrong and nothing has been charged. Please try again in a few minutes or message us on WhatsApp.",
    introuvableTitre: "Link not found",
    introuvableTexte: "We cannot find this booking. Please check the link you received or contact us on WhatsApp.",
    airbnb: "Your Airbnb booking does not require a deposit from us: nothing to do here.",
    annulee: "This booking is cancelled: no deposit is requested.",
    terminee: "This stay is over: no deposit is requested any more.",
    question: "Any question?",
    contact: "Message the team on WhatsApp",
    autreLangue: "Français",
    pied: "Superhosts · Concierge service in Marrakech · superhosts.ma",
  },
} as const;

const WHATSAPP = "https://wa.me/212668730909";

export default async function PageCaution({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ retour?: string; cs?: string; lang?: string }>;
}) {
  const { bookId } = await params;
  const sp = await searchParams;
  const lang: Lang = sp.lang === "en" ? "en" : "fr";
  const t = TEXTES[lang];

  // Retour de Stripe : on vérifie auprès de Stripe (sans attendre le webhook) que l'empreinte est
  // bien en place avant d'afficher la confirmation.
  let verification: "ok" | "attente" | null = null;
  if (sp.retour === "ok" && sp.cs && stripeConfigure()) {
    try {
      const { autorisee } = await enregistrerSessionTerminee(sp.cs);
      verification = autorisee ? "ok" : "attente";
    } catch (err) {
      console.error("Caution : vérification de la session au retour impossible", err);
      verification = "attente";
    }
  }

  const etat = await etatPageCaution(bookId);
  const chemin = `/caution/${encodeURIComponent(bookId)}`;
  const lienLangue = `${chemin}${lang === "fr" ? "?lang=en" : ""}`;

  const ctx = etat.type === "a_faire" || etat.type === "deja_enregistree" ? etat.ctx : null;
  const formulaire = etat.type === "a_faire" && verification !== "attente";

  return (
    <div className="min-h-screen bg-[#faf8f7] text-[#1c1917] dark:bg-[#0b0b0c] dark:text-[#f4f4f5]">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <Wordmark className="text-lg" />
        </div>
        <div className="flex items-center gap-4 text-[12px] text-[#6b6460] sm:text-[13px] dark:text-[#9a9aa0]">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Lock className="h-3.5 w-3.5" />
            {t.securise}
          </span>
          <Link href={lienLangue} className="underline-offset-2 hover:underline">
            {t.autreLangue}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        {formulaire && ctx ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
            <section className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">{t.bonjour(ctx.prenom)}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[#6b6460] dark:text-[#b4b4ba]">
                {t.intro} <strong className="font-semibold text-[#1c1917] dark:text-[#f4f4f5]">{t.introFort}</strong>
                {t.introSuite}
              </p>
              <div className="mt-5">
                <CarteSejour ctx={ctx} lang={lang} />
              </div>
              {/* Sur téléphone, le bloc d'action vient juste après le récapitulatif. */}
              <div className="mt-6 lg:hidden">
                <CarteAction ctx={ctx} lang={lang} retour={sp.retour} />
              </div>
              <Explications lang={lang} />
            </section>
            <aside className="hidden lg:block">
              <div className="sticky top-6">
                <CarteAction ctx={ctx} lang={lang} retour={sp.retour} />
              </div>
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-5">
            {ctx ? <CarteSejour ctx={ctx} lang={lang} /> : null}
            <div className="rounded-2xl border border-[#ece7e4] bg-white px-5 py-6 dark:border-[#2a2a2d] dark:bg-[#18181b]">
              {etat.type === "introuvable" ? (
                <Message icone="alerte" titre={t.introuvableTitre} texte={t.introuvableTexte} />
              ) : etat.type === "non_concernee" ? (
                <Message icone="info" titre={t.titre} texte={etat.raison === "airbnb" ? t.airbnb : etat.raison === "annulee" ? t.annulee : t.terminee} />
              ) : etat.type === "deja_enregistree" ? (
                <Message icone="ok" titre={t.okTitre} texte={t.okTexte} />
              ) : (
                <Message icone="attente" titre={t.attenteTitre} texte={t.attenteTexte} />
              )}
              <p className="mt-2 text-center text-[13px]">
                <a href={WHATSAPP} className="font-semibold text-[#660033] underline-offset-2 hover:underline dark:text-[#e0a3c0]">
                  {t.contact}
                </a>
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="px-4 pb-8 text-center text-[12px] text-[#6b6460] dark:text-[#9a9aa0]">{t.pied}</footer>
    </div>
  );
}

function nombreNuits(a: Date, b: Date): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (24 * 60 * 60 * 1000)));
}

function CarteSejour({ ctx, lang }: { ctx: ContexteCaution; lang: Lang }) {
  const t = TEXTES[lang];
  const locale = lang === "en" ? enGB : fr;
  const court = (d: Date) => format(new Date(d), "EEE d MMM", { locale });
  const long = (d: Date) => format(new Date(d), "EEE d MMMM yyyy", { locale });
  return (
    <div className="rounded-2xl border border-[#ece7e4] bg-white p-4 sm:p-5 dark:border-[#2a2a2d] dark:bg-[#18181b]">
      <div className="flex items-center gap-4">
        {/* Image à la une du logement ; le dégradé bordeaux reste visible derrière si l'image
            manque ou ne se charge pas. */}
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#8a1f4f] via-[#660033] to-[#3d001f] sm:h-24 sm:w-24">
          <Building2 className="h-7 w-7 text-white/80" />
          {ctx.villaPhotoUrl ? (
            // URL libre (Vercel Blob ou hébergeur externe) : <img> simple plutôt que next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.villaPhotoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">{ctx.villaNom} · Marrakech</p>
          <p className="mt-0.5 text-[14px] text-[#6b6460] dark:text-[#b4b4ba]">
            <span className="sm:hidden">
              {court(ctx.checkIn)} → {court(ctx.checkOut)}
            </span>
            <span className="hidden sm:inline">
              {long(ctx.checkIn)} → {long(ctx.checkOut)}
            </span>
            {" · "}
            {t.nuits(nombreNuits(ctx.checkIn, ctx.checkOut))}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[#ece7e4] pt-4 dark:border-[#2a2a2d]">
        <span className="text-[14px] text-[#6b6460] dark:text-[#b4b4ba]">{t.montant}</span>
        <span className="text-[26px] font-bold text-[#660033] dark:text-[#e0a3c0]">{formatEuros(ctx.montantCentimes)}</span>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e7f5f2] px-3 py-1.5 text-[12.5px] font-semibold text-[#0f766e] dark:bg-emerald-950/50 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t.badge}
      </p>
    </div>
  );
}

function CarteAction({ ctx, lang, retour }: { ctx: ContexteCaution; lang: Lang; retour?: string }) {
  const t = TEXTES[lang];
  const montant = formatEuros(ctx.montantCentimes);
  return (
    <div className="rounded-2xl border border-[#ece7e4] bg-white p-5 shadow-sm dark:border-[#2a2a2d] dark:bg-[#18181b]">
      <p className="text-[17px] font-semibold">{t.carteTitre}</p>

      {retour === "annule" ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t.annule}</p> : null}
      {retour === "erreur" ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 dark:bg-red-950/40 dark:text-red-200">{t.erreur}</p> : null}

      <form action={demarrerCaution.bind(null, ctx.beds24BookingId, lang)} className="mt-4 space-y-4">
        <label className="flex cursor-pointer gap-3 text-[13px] leading-relaxed text-[#6b6460] dark:text-[#b4b4ba]">
          <input type="checkbox" name="consentement" required className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#660033]" />
          <span>{t.consentement(montant)}</span>
        </label>
        <CautionBouton libelle={t.bouton(montant)} libelleEnCours={t.boutonEnCours} />
      </form>

      <p className="mt-3 text-center text-[12px] leading-relaxed text-[#6b6460] dark:text-[#9a9aa0]">{t.redirection}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-[#6b6460] dark:text-[#9a9aa0]">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> SSL
        </span>
        <span>Stripe</span>
        <span>Visa · Mastercard · Amex</span>
        <span>3D Secure</span>
      </div>
      <p className="mt-4 border-t border-[#ece7e4] pt-4 text-center text-[14px] dark:border-[#2a2a2d]">
        {t.question}{" "}
        <a href={WHATSAPP} className="font-semibold text-[#660033] underline-offset-2 hover:underline dark:text-[#e0a3c0]">
          {t.contact}
        </a>
      </p>
    </div>
  );
}

function Explications({ lang }: { lang: Lang }) {
  const t = TEXTES[lang];
  return (
    <>
      <h2 className="mb-3 mt-8 text-[17px] font-semibold">{t.commentTitre}</h2>
      <ol className="space-y-3.5">
        {t.etapes.map((e, i) => (
          <li key={e.titre} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f6eaf0] text-[14px] font-bold text-[#660033] dark:bg-[#3a1428] dark:text-[#e0a3c0]">{i + 1}</span>
            <div>
              <p className="text-[15px] font-semibold">{e.titre}</p>
              <p className="text-[14px] leading-relaxed text-[#6b6460] dark:text-[#b4b4ba]">{e.texte}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mb-1 mt-8 text-[17px] font-semibold">{t.faqTitre}</h2>
      <div>
        {t.faq.map((f) => (
          <details key={f.q} className="group border-b border-[#ece7e4] py-3 dark:border-[#2a2a2d]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-[#660033] transition-transform group-open:rotate-180 dark:text-[#e0a3c0]" />
            </summary>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b6460] dark:text-[#b4b4ba]">{f.r}</p>
          </details>
        ))}
      </div>
    </>
  );
}

function Message({ icone, titre, texte }: { icone: "ok" | "alerte" | "info" | "attente"; titre: string; texte: string }) {
  const Icone = icone === "ok" ? CheckCircle2 : icone === "alerte" ? TriangleAlert : icone === "attente" ? Clock : ShieldCheck;
  const couleur = icone === "ok" ? "text-emerald-600" : icone === "alerte" ? "text-amber-600" : "text-[#660033] dark:text-[#e0a3c0]";
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <Icone className={`h-10 w-10 ${couleur}`} />
      <h2 className="text-lg font-semibold">{titre}</h2>
      <p className="text-sm leading-relaxed text-[#6b6460] dark:text-[#b4b4ba]">{texte}</p>
    </div>
  );
}
