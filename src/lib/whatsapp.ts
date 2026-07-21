// Notifications WhatsApp via l'API officielle Meta (WhatsApp Cloud API), sans intermédiaire
// payant type Twilio. Nécessite les variables d'environnement :
// - WHATSAPP_ACCESS_TOKEN : jeton d'accès de l'app Meta (WhatsApp Business Platform)
// - WHATSAPP_PHONE_NUMBER_ID : identifiant du numéro expéditeur (WhatsApp Manager)
// - WHATSAPP_TEMPLATE_NAME : nom du modèle de message approuvé par Meta (catégorie "Utility"),
//   avec une seule variable {{1}} recevant le texte complet de la notification
// - WHATSAPP_NOTIFY_NUMBERS : numéros à prévenir, format international sans "+", séparés par
//   des virgules (ex. "212661757246,33681818100")
//
// Si ces variables ne sont pas définies, les notifications sont silencieusement ignorées
// (ne bloque jamais la synchronisation iCal en cas d'absence de configuration ou d'échec Meta).

async function sendWhatsAppTemplate(to: string, bodyText: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (!accessToken || !phoneNumberId || !templateName) return;

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: "fr" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: bodyText.slice(0, 1024) }],
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      console.error("Échec envoi WhatsApp Meta:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Erreur envoi WhatsApp Meta:", err);
  }
}

export async function notifyStaffWhatsApp(body: string): Promise<void> {
  const numbers = (process.env.WHATSAPP_NOTIFY_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (numbers.length === 0) return;
  await Promise.all(numbers.map((n) => sendWhatsAppTemplate(n, body)));
}
