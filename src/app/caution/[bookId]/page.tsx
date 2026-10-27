import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { enGB, fr } from "date-fns/locale";
import { CheckCircle2, Clock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { enregistrerSessionTerminee, etatPageCaution, type ContexteCaution } from "@/lib/caution/service";
import { formatEuros } from "@/lib/caution/regles";
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
    bonjour: (p: string) => (p ? `Bonjour ${p},` : "Bonjour,"),
    intro: "Pour finaliser votre arrivée, nous vous demandons d'enregistrer une caution par empreinte bancaire.",
    arrivee: "Arrivée",
    depart: "Départ",
    montant: "Caution",
    points: [
      "Aucun montant n'est débité : votre banque réserve simplement la somme sur votre carte.",
      "L'empreinte est levée après votre départ, une fois l'état des lieux effectué.",
      "Pour un séjour de plus d'une semaine, elle est renouvelée automatiquement sur la même carte.",
      "Paiement sécurisé par Stripe : nous ne voyons ni ne conservons votre numéro de carte.",
    ],
    bouton: "Enregistrer ma caution",
    boutonEnCours: "Redirection vers Stripe…",
    okTitre: "Caution enregistrée",
    okTexte: "Merci, votre empreinte bancaire est bien enregistrée. Vous n'avez plus rien à faire.",
    attenteTitre: "Validation en cours",
    attenteTexte: "Votre banque finalise l'empreinte. Rechargez cette page dans quelques instants ; si le message persiste, contactez-nous sur WhatsApp.",
    annule: "L'enregistrement a été interrompu. Aucun montant n'a été débité : vous pouvez réessayer quand vous voulez.",
    erreur: "Une erreur est survenue, aucun montant n'a été débité. Merci de réessayer dans quelques minutes ou de nous écrire sur WhatsApp.",
    introuvableTitre: "Lien introuvable",
    introuvableTexte: "Nous ne retrouvons pas cette réservation. Vérifiez le lien reçu ou contactez-nous sur WhatsApp.",
    airbnb: "Votre réservation Airbnb ne nécessite pas de caution de notre part : rien à faire ici.",
    annulee: "Cette réservation est annulée : aucune caution n'est demandée.",
    terminee: "Ce séjour est terminé : aucune caution n'est plus demandée.",
    contact: "Une question ? WhatsApp",
    autreLangue: "English",
    pied: "Superhosts · Marrakech · Paiement sécurisé par Stripe",
  },
  en: {
    titre: "Stay security deposit",
    bonjour: (p: string) => (p ? `Hello ${p},` : "Hello,"),
    intro: "To finalise your arrival, we ask you to register a security deposit as a card pre-authorisation.",
    arrivee: "Check-in",
    depart: "Check-out",
    montant: "Deposit",
    points: [
      "Nothing is charged: your bank simply holds the amount on your card.",
      "The hold is released after your departure, once the property has been checked.",
      "For stays longer than a week, the hold is renewed automatically on the same card.",
      "Secure payment by Stripe: we never see or store your card number.",
    ],
    bouton: "Register my deposit",
    boutonEnCours: "Redirecting to Stripe…",
    okTitre: "Deposit registered",
    okTexte: "Thank you, your card pre-authorisation is registered. There is nothing else to do.",
    attenteTitre: "Validation in progress",
    attenteTexte: "Your bank is finalising the hold. Please reload this page in a few moments; if this message stays, contact us on WhatsApp.",
    annule: "The registration was interrupted. Nothing has been charged: you can try again at any time.",
    erreur: "Something went wrong and nothing has been charged. Please try again in a few minutes or message us on WhatsApp.",
    introuvableTitre: "Link not found",
    introuvableTexte: "We cannot find this booking. Please check the link you received or contact us on WhatsApp.",
    airbnb: "Your Airbnb booking does not require a deposit from us: nothing to do here.",
    annulee: "This booking is cancelled: no deposit is requested.",
    terminee: "This stay is over: no deposit is requested any more.",
    contact: "Any question? WhatsApp",
    autreLangue: "Français",
    pied: "Superhosts · Marrakech · Secure payment by Stripe",
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

  return (
    <div className="min-h-screen bg-[#f6f6f7] px-3 py-6 sm:px-4 sm:py-10 dark:bg-[#0b0b0c]">
      <div className="mx-auto w-full max-w-md rounded-lg border border-[#e5e5e5] bg-white dark:border-[#2a2a2d] dark:bg-[#18181b]">
        <div className="flex flex-col items-center gap-3 border-b border-[#ececec] px-5 pb-6 pt-8 sm:px-8 sm:pt-9 dark:border-[#2a2a2d]">
          <Logo size={52} />
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-[#71717a] dark:text-[#9a9aa0]">{t.titre}</p>
            {etat.type === "a_faire" || etat.type === "deja_enregistree" ? (
              <h1 className="mt-1 text-xl font-semibold text-[#18181b] dark:text-[#f4f4f5]">{etat.ctx.villaNom}</h1>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-8">
          {etat.type === "introuvable" ? (
            <Message icone="alerte" titre={t.introuvableTitre} texte={t.introuvableTexte} />
          ) : etat.type === "non_concernee" ? (
            <Message icone="info" titre={t.titre} texte={etat.raison === "airbnb" ? t.airbnb : etat.raison === "annulee" ? t.annulee : t.terminee} />
          ) : etat.type === "deja_enregistree" ? (
            <Message icone="ok" titre={t.okTitre} texte={t.okTexte} />
          ) : verification === "attente" ? (
            <Message icone="attente" titre={t.attenteTitre} texte={t.attenteTexte} />
          ) : (
            <FormulaireCaution ctx={etat.ctx} lang={lang} retour={sp.retour} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#ececec] px-5 py-4 text-[12px] sm:px-8 dark:border-[#2a2a2d]">
          <a href={WHATSAPP} className="font-medium text-[#660033] underline-offset-2 hover:underline dark:text-[#e0a3c0]">
            {t.contact}
          </a>
          <Link href={lienLangue} className="text-[#71717a] underline-offset-2 hover:underline dark:text-[#9a9aa0]">
            {t.autreLangue}
          </Link>
        </div>
        <div className="border-t border-[#ececec] px-5 py-3 sm:px-8 dark:border-[#2a2a2d]">
          <p className="text-[11px] leading-relaxed text-[#a1a1aa]">{t.pied}</p>
        </div>
      </div>
    </div>
  );
}

function FormulaireCaution({ ctx, lang, retour }: { ctx: ContexteCaution; lang: Lang; retour?: string }) {
  const t = TEXTES[lang];
  const locale = lang === "en" ? enGB : fr;
  const jour = (d: Date) => format(new Date(d), lang === "en" ? "d MMMM yyyy" : "d MMMM yyyy", { locale });
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-medium text-[#18181b] dark:text-[#f4f4f5]">{t.bonjour(ctx.prenom)}</p>
        <p className="text-sm leading-relaxed text-[#52525b] dark:text-[#b4b4ba]">{t.intro}</p>
      </div>

      <div className="space-y-3 rounded-md bg-[#f6f6f7] p-4 dark:bg-[#0b0b0c]">
        <Ligne label={t.arrivee} value={jour(ctx.checkIn)} />
        <Ligne label={t.depart} value={jour(ctx.checkOut)} />
        <div className="flex items-center justify-between border-t border-[#e5e5e5] pt-3 dark:border-[#2a2a2d]">
          <span className="text-sm font-semibold text-[#18181b] dark:text-[#f4f4f5]">{t.montant}</span>
          <span className="text-base font-semibold text-[#660033] dark:text-[#e0a3c0]">{formatEuros(ctx.montantCentimes)}</span>
        </div>
      </div>

      <ul className="space-y-2.5">
        {t.points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[13px] leading-relaxed text-[#52525b] dark:text-[#b4b4ba]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#660033] dark:text-[#e0a3c0]" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {retour === "annule" ? <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t.annule}</p> : null}
      {retour === "erreur" ? <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-900 dark:bg-red-950/40 dark:text-red-200">{t.erreur}</p> : null}

      <form action={demarrerCaution.bind(null, ctx.beds24BookingId, lang)}>
        <CautionBouton libelle={t.bouton} libelleEnCours={t.boutonEnCours} />
      </form>
    </>
  );
}

function Ligne({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[#71717a] dark:text-[#9a9aa0]">{label}</span>
      <span className="text-right font-medium text-[#18181b] dark:text-[#f4f4f5]">{value}</span>
    </div>
  );
}

function Message({ icone, titre, texte }: { icone: "ok" | "alerte" | "info" | "attente"; titre: string; texte: string }) {
  const Icone = icone === "ok" ? CheckCircle2 : icone === "alerte" ? TriangleAlert : icone === "attente" ? Clock : ShieldCheck;
  const couleur = icone === "ok" ? "text-emerald-600" : icone === "alerte" ? "text-amber-600" : "text-[#660033] dark:text-[#e0a3c0]";
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <Icone className={`h-10 w-10 ${couleur}`} />
      <h2 className="text-lg font-semibold text-[#18181b] dark:text-[#f4f4f5]">{titre}</h2>
      <p className="text-sm leading-relaxed text-[#52525b] dark:text-[#b4b4ba]">{texte}</p>
    </div>
  );
}
