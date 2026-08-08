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
      // v3, sur demande explicite de Kamel (2026-08-08) même après un premier test jugé "encore
      // pire" que v2 — le vrai problème n'était pas le modèle mais le TEXTE lu, écrit en arabe
      // littéraire avec seulement quelques mots darija en plus (voir buildOfferMessage plus haut,
      // maintenant réécrit en darija de bout en bout). À rejuger avec ce texte corrigé avant de
      // remettre en cause le modèle une deuxième fois.
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    console.error("Échec génération vocale ElevenLabs:", res.status, await res.text());
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}
