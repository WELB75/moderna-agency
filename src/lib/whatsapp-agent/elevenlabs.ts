// Voix "Ghizlane" (bibliothèque ElevenLabs) choisie par Kamel pour parler en darija au
// personnel ménage/cuisine, dont certaines ne savent pas lire/écrire — voir sendWhatsAppVoice
// dans send.ts. Clé API restreinte au seul endpoint Text to Speech.
const VOICE_ID = "OfGMGmhShO8iL9jCkXy8";

// null si la clé manque ou si l'appel échoue : la voix est un ajout, jamais un blocant — le
// message texte doit toujours partir même si la génération vocale rate (voir sendWhatsAppVoice).
export async function textToSpeech(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    console.error("Échec génération vocale ElevenLabs:", res.status, await res.text());
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}
