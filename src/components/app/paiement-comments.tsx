"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommentItem, type CommentRow } from "@/components/app/intervention-comments";
import {
  addPaiementComment,
  updatePaiementComment,
  deletePaiementComment,
} from "@/lib/actions/paiement-comments";

export function PaiementComments({
  paiementId,
  comments,
  auteur,
  auteurType,
  authorOptions,
}: {
  paiementId: string;
  comments: CommentRow[];
  auteur: string;
  auteurType: "staff" | "proprietaire";
  authorOptions?: string[];
}) {
  const [localComments, setLocalComments] = useState(comments);
  const [message, setMessage] = useState("");
  const storageKey = "portail-comment-auteur";
  const [selectedAuteur, setSelectedAuteur] = useState(() => {
    if (typeof window === "undefined" || !authorOptions || authorOptions.length <= 1) return auteur;
    const saved = window.localStorage.getItem(storageKey);
    return saved && authorOptions.includes(saved) ? saved : auteur;
  });
  const [isPending, startTransition] = useTransition();

  function handleAuteurChange(value: string) {
    setSelectedAuteur(value);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, value);
  }

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    const finalAuteur = authorOptions && authorOptions.length > 1 ? selectedAuteur : auteur;
    startTransition(async () => {
      try {
        await addPaiementComment(paiementId, finalAuteur, auteurType, trimmed);
        setLocalComments((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, auteur: finalAuteur, auteurType, message: trimmed, createdAt: new Date() },
        ]);
        setMessage("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleUpdated(id: string, newMessage: string) {
    setLocalComments((prev) => prev.map((c) => (c.id === id ? { ...c, message: newMessage } : c)));
  }

  function handleDeleted(id: string) {
    setLocalComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Échanges</p>
      {localComments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message pour l&apos;instant.</p>
      ) : (
        <div className="space-y-2">
          {localComments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onUpdate={updatePaiementComment}
              onDelete={deletePaiementComment}
            />
          ))}
        </div>
      )}
      {authorOptions && authorOptions.length > 1 ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Vous écrivez en tant que :</p>
          <Select value={selectedAuteur} onValueChange={handleAuteurChange}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {authorOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Écrire un message..."
          rows={2}
          className="flex-1"
        />
        <Button type="button" size="icon" disabled={isPending} onClick={handleSend}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
