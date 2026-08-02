import { readFileSync } from "node:fs";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend en mode sandbox (pas de domaine vérifié) : n'autorise l'envoi que vers l'adresse du
// compte Resend lui-même, quel que soit le destinataire réel du booking. À retirer une fois un
// vrai domaine (ex. moderna-agency.com) vérifié sur Resend — il suffira alors d'envoyer à
// l'adresse du client directement. Voir la mémoire du projet pour le contexte complet.
const SANDBOX_EMAIL_OVERRIDE = "tmshparis@gmail.com";

// Logo Moderna Agency, fond transparent, décliné en noir (mode clair) et blanc (mode sombre) —
// généré depuis modernaagency.com/wp-content/uploads/2026/01/cropped-LOGO-DARK.png.
const LOGO_BLACK_DATA_URI = `data:image/png;base64,${readFileSync(new URL("./assets/logo-black-160.png", import.meta.url)).toString("base64")}`;
const LOGO_WHITE_DATA_URI = `data:image/png;base64,${readFileSync(new URL("./assets/logo-white-160.png", import.meta.url)).toString("base64")}`;

function formatDateFr(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function buildConfirmationEmailHtml(params: {
  prenom: string;
  villaNom: string;
  villaBlurb: string;
  dateArrivee: string;
  dateDepart: string;
  nights: number;
  total: number;
  guestsCount: number;
  notes: string;
  bookingRef: string;
}) {
  const { prenom, villaNom, villaBlurb, dateArrivee, dateDepart, nights: n, total, guestsCount, notes, bookingRef } = params;
  const row = (label: string, value: string, first = false) => `
            <tr>
              <td class="text-secondary" style="padding:9px 0;${first ? "" : "border-top:1px solid #ececec;"}color:#71717a;font-size:13px;">${label}</td>
              <td class="text-primary" style="padding:9px 0;${first ? "" : "border-top:1px solid #ececec;"}color:#18181b;font-size:13px;text-align:right;">${value}</td>
            </tr>`;
  const notesRow = notes ? row("Demandes particulières", notes) : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  body { margin:0; padding:0; }
  @media (prefers-color-scheme: dark) {
    .body-bg { background-color:#0b0b0c !important; }
    .card-bg { background-color:#18181b !important; border-color:#2a2a2d !important; }
    .text-primary { color:#f4f4f5 !important; }
    .text-secondary { color:#9a9aa0 !important; }
    .divider { border-color:#2a2a2d !important; }
    .logo-light { display:none !important; }
    .logo-dark { display:inline-block !important; }
  }
  .logo-dark { display:none; }
</style>
</head>
<body class="body-bg" style="background-color:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="body-bg" style="background-color:#f6f6f7;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" class="card-bg" style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:6px;">
        <tr><td align="center" style="padding:36px 40px 20px;">
          <img src="${LOGO_BLACK_DATA_URI}" width="52" height="52" alt="Moderna Agency" class="logo-light" style="display:inline-block;">
          <img src="${LOGO_WHITE_DATA_URI}" width="52" height="52" alt="Moderna Agency" class="logo-dark" style="display:none;">
        </td></tr>
        <tr><td class="divider" style="border-top:1px solid #ececec;"></td></tr>
        <tr><td style="padding:28px 40px 0;">
          <p class="text-secondary" style="margin:0 0 6px;font-size:11px;letter-spacing:1px;color:#71717a;text-transform:uppercase;">Réservation confirmée</p>
          <h1 class="text-primary" style="margin:0 0 4px;font-size:20px;line-height:1.3;color:#18181b;font-weight:600;">${villaNom}</h1>
          <p class="text-secondary" style="margin:0;font-size:13px;color:#71717a;">${villaBlurb}</p>
        </td></tr>
        <tr><td style="padding:20px 40px 0;">
          <p class="text-primary" style="font-size:14px;color:#18181b;line-height:1.6;margin:0;">Bonjour ${prenom},</p>
          <p class="text-secondary" style="font-size:14px;color:#52525b;line-height:1.6;margin:8px 0 0;">Votre réservation est confirmée. Voici le récapitulatif de votre séjour.</p>
        </td></tr>
        <tr><td style="padding:20px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row("Arrivée", `${formatDateFr(dateArrivee)}, 15h00`, true)}
            ${row("Départ", `${formatDateFr(dateDepart)}, 11h00`)}
            ${row("Durée", `${n} nuit${n > 1 ? "s" : ""}`)}
            ${row("Voyageurs", String(guestsCount))}
            ${notesRow}
          </table>
        </td></tr>
        <tr><td style="padding:16px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececec;" class="divider">
            <tr>
              <td class="text-primary" style="padding:14px 0 0;font-size:14px;color:#18181b;font-weight:600;">Total</td>
              <td class="text-primary" style="padding:14px 0 0;font-size:14px;color:#18181b;font-weight:600;text-align:right;">${total} €</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 40px 0;">
          <p class="text-secondary" style="font-size:13px;color:#71717a;line-height:1.6;margin:0;">Draps et serviettes fournis pour la durée du séjour. Un panier de bienvenue vous attendra à votre arrivée.</p>
        </td></tr>
        <tr><td style="padding:24px 40px 36px;">
          <p class="text-secondary" style="font-size:13px;color:#71717a;line-height:1.6;margin:0;">Une question avant votre arrivée ? Répondez directement à ce message, ou suivez-nous sur <a href="https://www.instagram.com/moderna__agency" style="color:#52525b;">Instagram</a>.</p>
        </td></tr>
        <tr><td class="divider" style="border-top:1px solid #ececec;padding:16px 40px;">
          <p class="text-secondary" style="font-size:11px;color:#a1a1aa;line-height:1.5;margin:0;">Moderna Agency · Marrakech · Référence ${bookingRef}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendConfirmationEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log("Resend non configuré (RESEND_API_KEY absente) : email de confirmation non envoyé.");
    return;
  }
  const realTo = to;
  const actualTo = to === SANDBOX_EMAIL_OVERRIDE ? to : SANDBOX_EMAIL_OVERRIDE;
  try {
    const { data, error } = await resend.emails.send({
      from: "Moderna Agency <onboarding@resend.dev>",
      to: actualTo,
      subject,
      html,
    });
    if (error) {
      console.error("Échec envoi email (Resend):", error);
      return;
    }
    if (actualTo !== realTo) {
      console.log(`Email envoyé (id=${data?.id}) à ${actualTo} au lieu de ${realTo} : compte Resend en mode sandbox.`);
    } else {
      console.log(`Email de confirmation envoyé (id=${data?.id}) à ${actualTo}.`);
    }
  } catch (err) {
    console.error("Échec envoi email (Resend):", err);
  }
}
