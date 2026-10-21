"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
// En production Next remplace le message d'une erreur serveur par un texte technique anglais
// ("An error occurred in the Server Components render...") : on le masque, sinon l'équipe lit du
// jargon (ex. quand l'IA est indisponible).
function messageLisible(err: unknown, parDefaut: string): string {
  if (!(err instanceof Error) || err.message.includes("Server Components render")) return parDefaut;
  return err.message;
}

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
      toast.error(messageLisible(err, "Suggestion indisponible pour le moment."));
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
        toast.error(messageLisible(err, "Échec de l'envoi."));
      }
    });
  }

  return (
    <div className="border-t border-border bg-card px-3 pb-3 pt-2 md:px-4">
      {/* Note de l'agent IA (raison du brouillon, ou "à vérifier par un humain") : une ligne
          discrète au-dessus du composeur, effaçable. */}
      {noteAgent ? (
        <div
          className={cn(
            "mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
            noteAgent.humain ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground"
          )}
        >
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{noteAgent.humain ? "À vérifier par un humain · " : "Brouillon IA · "}</span>
            {noteAgent.texte}
          </span>
          <button type="button" onClick={() => setNoteAgent(null)} aria-label="Masquer" className="shrink-0 rounded p-0.5 hover:bg-background/60">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex items-end gap-2 rounded-2xl border border-input bg-background p-1.5 pl-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
      >
        <button
          type="button"
          onClick={suggerer}
          disabled={suggestionEnCours || isPending}
          title="Suggérer une réponse (brouillon IA, à relire avant envoi)"
          aria-label="Suggérer une réponse"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {suggestionEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </button>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder={suggestionEnCours ? "L'IA prépare un brouillon…" : "Écrire une réponse…"}
          rows={1}
          className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={isPending || !message.trim()} aria-label="Envoyer">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">Entrée pour envoyer · Maj+Entrée pour un retour à la ligne</span>
        {langue ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={traduire} onChange={(e) => setTraduire(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
            Traduire ma réponse en <span className="font-medium text-foreground">{langue}</span> avant l&apos;envoi
          </label>
        ) : null}
      </div>
    </div>
  );
}
