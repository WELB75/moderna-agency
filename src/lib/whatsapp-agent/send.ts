import { textToSpeech } from "@/lib/whatsapp-agent/elevenlabs";

// Point d'entrée unique pour l'envoi WhatsApp — auparavant dupliqué dans staff.ts et
// whatsapp-webhook/route.ts (deux copies identiques de sendWhatsAppText).
export async function sendWhatsAppText(to: string, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
  });
  if (!res.ok) console.error("Échec envoi texte WhatsApp:", res.status, await res.text());
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
// ne savent pas lire (Kamel, 2026-08-08). Le texte part toujours ; la voix est best-effort.
export async function sendWhatsAppTextAndVoice(to: string, body: string) {
  await Promise.all([sendWhatsAppText(to, body), sendWhatsAppVoice(to, body)]);
}
