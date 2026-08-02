"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Circle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { postChatMessage, toggleChatMessageTraite, deleteChatMessage, type ChatCategorie } from "@/lib/actions/chat";
import { cn } from "@/lib/utils";

export type ChatMessageRow = {
  id: string;
  message: string;
  traite: boolean;
  traiteAt: Date | null;
  traitePar: string | null;
  createdByName: string;
  createdAt: Date;
  villaNom: string | null;
  villaNumero: string | null;
};

export function ChatPanel({
  categorie,
  messages,
  villas,
}: {
  categorie: ChatCategorie;
  messages: ChatMessageRow[];
  villas: { id: string; nom: string; numero: string }[];
}) {
  const [text, setText] = useState("");
  const [villaId, setVillaId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function handlePost() {
    if (!text.trim()) return;
    startTransition(async () => {
      try {
        await postChatMessage(categorie, text, villaId || null);
        setText("");
        setVillaId("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 border p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message..."
          rows={2}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={villaId} onValueChange={setVillaId}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Villa (optionnel)" />
            </SelectTrigger>
            <SelectContent>
              {villas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nom} (n°{v.numero})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={isPending || !text.trim()} onClick={handlePost} className="ml-auto">
            <Send className="h-3.5 w-3.5" />
            Envoyer
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun message dans cette catégorie.</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <ChatMessageItem key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessageItem({ m }: { m: ChatMessageRow }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleChatMessageTraite(m.id, !m.traite);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className={cn("space-y-1.5 border p-3", !m.traite && "border-foreground/30")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.createdByName}</span>
          <span>·</span>
          <span>{format(m.createdAt, "d MMM HH:mm", { locale: fr })}</span>
          {m.villaNom ? (
            <Badge variant="outline" className="text-xs">
              {m.villaNom} (n°{m.villaNumero})
            </Badge>
          ) : null}
        </div>
        <ConfirmDeleteButton
          action={deleteChatMessage.bind(null, m.id)}
          title="Supprimer ce message ?"
          description="Cette action est irréversible."
        />
      </div>
      <p className="whitespace-pre-wrap text-sm">{m.message}</p>
      <Button
        type="button"
        variant={m.traite ? "default" : "outline"}
        size="sm"
        disabled={isPending}
        onClick={handleToggle}
      >
        {m.traite ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        {m.traite ? `Traité par ${m.traitePar ?? "?"}` : "Marquer traité"}
      </Button>
    </div>
  );
}
