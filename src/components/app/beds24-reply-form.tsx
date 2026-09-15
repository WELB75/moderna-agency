"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sendBeds24Message } from "@/lib/actions/beds24";

// Répondre à un voyageur Airbnb/Booking.com depuis l'app — Kamel, 2026-09-15 : "je veux pouvoir
// aussi y répondre sur l'app". router.refresh() plutôt qu'une mise à jour optimiste : le message
// envoyé doit repasser par Beds24 pour apparaître avec son vrai id/horodatage au prochain chargement.
export function Beds24ReplyForm({ reservationId }: { reservationId: string }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await sendBeds24Message(reservationId, trimmed);
        setMessage("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Échec de l'envoi.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3">
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
  );
}
