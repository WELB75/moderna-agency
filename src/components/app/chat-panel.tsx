"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Circle, Send, Reply } from "lucide-react";
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
import {
  postChatMessage,
  replyToChatMessage,
  toggleChatMessageTraite,
  deleteChatMessage,
  type ChatCategorie,
} from "@/lib/actions/chat";
import { cn } from "@/lib/utils";

export type ChatMessageRow = {
  id: string;
  parentId: string | null;
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

  // Fils de discussion : les messages racine (parentId null) gardent l'ordre du plus récent
  // d'abord, mais leurs réponses se lisent dans l'ordre chronologique, comme une conversation.
  const racines = messages.filter((m) => !m.parentId);
  const reponsesParParent = new Map<string, ChatMessageRow[]>();
  for (const m of messages) {
    if (!m.parentId) continue;
    const list = reponsesParParent.get(m.parentId) ?? [];
    list.push(m);
    reponsesParParent.set(m.parentId, list);
  }
  for (const list of reponsesParParent.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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

      {racines.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun message dans cette catégorie.</p>
      ) : (
        <div className="space-y-2">
          {racines.map((m) => (
            <ChatMessageItem key={m.id} m={m} reponses={reponsesParParent.get(m.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessageItem({ m, reponses }: { m: ChatMessageRow; reponses: ChatMessageRow[] }) {
  const [showReply, setShowReply] = useState(false);

  return (
    <div className={cn("space-y-2 border p-3", !m.traite && "border-foreground/30")}>
      <ChatMessageBody m={m} showReplyToggle onToggleReply={() => setShowReply((v) => !v)} />

      {reponses.length > 0 ? (
        <div className="ml-4 space-y-2 border-l pl-3">
          {reponses.map((r) => (
            <ChatMessageBody key={r.id} m={r} compact />
          ))}
        </div>
      ) : null}

      {showReply ? <ReplyForm parentId={m.id} onDone={() => setShowReply(false)} /> : null}
    </div>
  );
}

function ChatMessageBody({
  m,
  compact = false,
  showReplyToggle = false,
  onToggleReply,
}: {
  m: ChatMessageRow;
  compact?: boolean;
  showReplyToggle?: boolean;
  onToggleReply?: () => void;
}) {
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.createdByName}</span>
          <span>·</span>
          <span>{format(m.createdAt, "d MMM HH:mm", { locale: fr })}</span>
          {m.villaNom && !compact ? (
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
      <div className="flex flex-wrap items-center gap-1.5">
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
        {showReplyToggle ? (
          <Button type="button" variant="ghost" size="sm" onClick={onToggleReply}>
            <Reply className="h-3.5 w-3.5" />
            Répondre
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Formulaire de réponse, ouvert/fermé à la demande sous n'importe quel message, à tout moment —
// pas seulement juste après l'envoi du message d'origine.
function ReplyForm({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    if (!text.trim()) return;
    startTransition(async () => {
      try {
        await replyToChatMessage(parentId, text);
        setText("");
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="ml-4 space-y-2 border-l pl-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Répondre..."
        rows={2}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <Button type="button" size="sm" disabled={isPending || !text.trim()} onClick={handleSend}>
          <Send className="h-3.5 w-3.5" />
          Répondre
        </Button>
      </div>
    </div>
  );
}
