"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { repondreWhatsAppAgence } from "@/lib/actions/whatsapp-agence";

// Réponse depuis l'app via la ligne WhatsApp Business de l'agence. Hors des 24 h qui suivent le
// dernier message du client, WhatsApp n'accepte plus le texte libre : on désactive la saisie et on
// renvoie vers le téléphone (qui, en coexistence, n'a pas cette limite).
function messageLisible(err: unknown, parDefaut: string): string {
  if (!(err instanceof Error) || err.message.includes("Server Components render")) return parDefaut;
  return err.message;
}

export function WhatsAppAgenceReplyForm({ contact, fenetreOuverte }: { contact: string; fenetreOuverte: boolean }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  if (!fenetreOuverte) {
    return (
      <p className="border-t border-border p-3 text-sm text-muted-foreground">
        Le client n&apos;a pas écrit depuis plus de 24 h : WhatsApp n&apos;accepte plus le texte libre depuis l&apos;app. Réponds depuis le téléphone de l&apos;agence.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await repondreWhatsAppAgence(contact, trimmed);
        setMessage("");
        router.refresh();
      } catch (err) {
        toast.error(messageLisible(err, "Échec de l'envoi."));
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
        placeholder="Répondre sur WhatsApp..."
        rows={2}
        className="min-h-0 flex-1 resize-none"
      />
      <Button type="submit" size="icon" disabled={isPending || !message.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
