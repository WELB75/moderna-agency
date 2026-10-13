"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sendBeds24InquiryMessage, sendBeds24Message } from "@/lib/actions/beds24";
import { traduireReponse } from "@/lib/actions/traduction";

// Répondre à un voyageur Airbnb/Booking.com depuis l'app — Kamel, 2026-09-15 : "je veux pouvoir
// aussi y répondre sur l'app". router.refresh() plutôt qu'une mise à jour optimiste : le message
// envoyé doit repasser par Beds24 pour apparaître avec son vrai id/horodatage au prochain chargement.
// reservationId : réservation de l'app ; beds24InquiryId : demande d'information Airbnb encore
// sans réservation (lue directement dans Beds24).
// langue : langue du voyageur si ce n'est pas du français — la réponse écrite en français est alors
// traduite automatiquement avant l'envoi (Kamel, 2026-10-13).
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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

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
