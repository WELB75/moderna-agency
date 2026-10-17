"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sendBeds24InquiryMessage, sendBeds24Message } from "@/lib/actions/beds24";
import { traduireReponse } from "@/lib/actions/traduction";
import { suggererReponseIA } from "@/lib/actions/messages-agent";

// Répondre à un voyageur Airbnb/Booking.com depuis l'app — Kamel, 2026-09-15 : "je veux pouvoir
// aussi y répondre sur l'app". router.refresh() plutôt qu'une mise à jour optimiste : le message
// envoyé doit repasser par Beds24 pour apparaître avec son vrai id/horodatage au prochain chargement.
// reservationId : réservation de l'app ; beds24InquiryId : demande d'information Airbnb encore
// sans réservation (lue directement dans Beds24).
// langue : langue du voyageur si ce n'est pas du français — la réponse écrite en français est alors
// traduite automatiquement avant l'envoi (Kamel, 2026-10-13).
// Bouton "Suggérer une réponse" (Kamel, 2026-10-17) : l'agent IA prépare un brouillon en français
// dans la zone de saisie, jamais envoyé tout seul — l'équipe relit, modifie et envoie.
export function Beds24ReplyForm({
  reservationId,
  beds24InquiryId,
  langue = null,
}: {
  reservationId?: string | null;
  beds24InquiryId?: number | null;
  langue?: string | null;
}) {
  const [message, setMessage] = useState("");
  const [traduire, setTraduire] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [suggestionEnCours, setSuggestionEnCours] = useState(false);
  const [noteAgent, setNoteAgent] = useState<{ texte: string; humain: boolean } | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  async function suggerer() {
    setSuggestionEnCours(true);
    setNoteAgent(null);
    try {
      const s = await suggererReponseIA({ reservationId, beds24InquiryId });
      if (s.reponseFr) setMessage(s.reponseFr);
      setNoteAgent({ texte: s.reponseFr ? s.raison : s.raison || "Pas de réponse nécessaire.", humain: s.besoinHumain || !s.reponseFr });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suggestion indisponible.");
    } finally {
      setSuggestionEnCours(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        let aEnvoyer = trimmed;
        if (langue && traduire) aEnvoyer = await traduireReponse(trimmed, langue);
        if (reservationId) await sendBeds24Message(reservationId, aEnvoyer);
        else if (beds24InquiryId) await sendBeds24InquiryMessage(beds24InquiryId, aEnvoyer);
        else throw new Error("Conversation sans canal de réponse.");
        if (aEnvoyer !== trimmed) toast.success(`Envoyé en ${langue} : ${aEnvoyer}`);
        setMessage("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Échec de l'envoi.");
      }
    });
  }

  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={suggerer} disabled={suggestionEnCours || isPending}>
          {suggestionEnCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Suggérer une réponse
        </Button>
        {noteAgent ? (
          <span className={`text-xs ${noteAgent.humain ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
            {noteAgent.humain ? "À vérifier par un humain : " : "Brouillon IA : "}
            {noteAgent.texte}
          </span>
        ) : null}
      </div>
      {langue ? (
        <label className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={traduire} onChange={(e) => setTraduire(e.target.checked)} />
          Écris en français : ta réponse sera traduite en {langue} avant l&apos;envoi
        </label>
      ) : null}
    <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        placeholder="Écrire une réponse..."
        rows={2}
        className="min-h-0 flex-1 resize-none"
      />
      <Button type="submit" size="icon" disabled={isPending || !message.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
    </div>
  );
}
