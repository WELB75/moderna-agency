import { textToSpeech } from "@/lib/whatsapp-agent/elevenlabs";

// Point d'entrée unique pour l'envoi WhatsApp — auparavant dupliqué dans staff.ts et
// whatsapp-webhook/route.ts (deux copies identiques de sendWhatsAppText).
// Renvoie true/false selon que Meta a accepté le message (statut HTTP), pour que les appelants
// qui l'annoncent comme fait à Kamel (ex. relanceStaleMaintenanceConversations) puissent distinguer
// un vrai échec d'un envoi réussi — auparavant, un échec ne finissait que dans les logs serveur
// (jamais vus par Kamel) et le compte-rendu WhatsApp disait "envoyée" même si ça avait raté.
// Kamel, 2026-08-22 : "tu es sur que l'agent envoie bien des messages aux personnes concerné ?"
export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return false;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
  });
  if (!res.ok) {
    console.error("Échec envoi texte WhatsApp:", res.status, await res.text());
    return false;
  }
  return true;
}

// Premier message à un contact qui n'a jamais écrit à l'agence : WhatsApp interdit le texte libre
// dans ce cas (accepté par l'API avec un 200, mais jamais livré en pratique) — seul un modèle de
// message pré-approuvé par Meta peut ouvrir la conversation. Une fois que la personne répond,
// tous les messages suivants peuvent redevenir du texte libre (sendWhatsAppText), la fenêtre de
// conversation est ouverte. Kamel, 2026-08-22 : "meme les autres technicien... ils reçoivent pas".
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return false;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
          : [],
      },
    }),
  });
  if (!res.ok) {
    console.error("Échec envoi template WhatsApp:", res.status, await res.text());
    return false;
  }
  return true;
}

// Upload d'un fichier vers la médiathèque WhatsApp (nécessaire avant de pouvoir l'envoyer comme
// message) — symétrique de downloadWhatsAppMedia côté entrant dans whatsapp-webhook/route.ts.
async function uploadWhatsAppMedia(buffer: Buffer, mimeType: string): Promise<string | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), "message.mp3");
  form.append("type", mimeType);

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    console.error("Échec upload média WhatsApp:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function sendWhatsAppAudio(to: string, mediaId: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "audio", audio: { id: mediaId } }),
  });
  if (!res.ok) console.error("Échec envoi audio WhatsApp:", res.status, await res.text());
}

// Génère la voix (ElevenLabs, darija) et l'envoie comme note vocale. Échoue silencieusement à
// chaque étape (clé manquante, génération ratée, upload raté) sans jamais lever d'exception —
// la voix est un complément au texte, jamais un blocant pour l'envoi du message lui-même.
export async function sendWhatsAppVoice(to: string, text: string) {
  const audio = await textToSpeech(text);
  if (!audio) return;
  const mediaId = await uploadWhatsAppMedia(audio, "audio/mpeg");
  if (!mediaId) return;
  await sendWhatsAppAudio(to, mediaId);
}

// Texte + note vocale en parallèle — pour le personnel ménage/cuisine, dont certaines personnes
// ne savent pas lire (Kamel, 2026-08-08). Le texte part toujours ; la voix est best-effort (son
// échec n'affecte jamais le true/false renvoyé, qui reflète uniquement l'envoi du texte).
export async function sendWhatsAppTextAndVoice(to: string, body: string): Promise<boolean> {
  const [textOk] = await Promise.all([sendWhatsAppText(to, body), sendWhatsAppVoice(to, body)]);
  return textOk;
}
