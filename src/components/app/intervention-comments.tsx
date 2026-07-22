"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUtcDayMonthTime } from "@/lib/now";
import {
  addInterventionComment,
  updateInterventionComment,
  deleteInterventionComment,
} from "@/lib/actions/intervention-comments";

export type CommentRow = {
  id: string;
  auteur: string;
  auteurType: string;
  message: string;
  createdAt: Date;
};

export function InterventionComments({
  interventionId,
  comments,
  auteur,
  auteurType,
  authorOptions,
}: {
  interventionId: string;
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
        await addInterventionComment(interventionId, finalAuteur, auteurType, trimmed);
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
            <CommentItem key={c.id} comment={c} onUpdated={handleUpdated} onDeleted={handleDeleted} />
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

function CommentItem({
  comment,
  onUpdated,
  onDeleted,
}: {
  comment: CommentRow;
  onUpdated: (id: string, message: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.message);
  const [isPending, startTransition] = useTransition();
  const isLocal = comment.id.startsWith("local-");

  function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await updateInterventionComment(comment.id, trimmed);
        onUpdated(comment.id, trimmed);
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteInterventionComment(comment.id);
        onDeleted(comment.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="rounded-md bg-muted/40 p-2 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{comment.auteur}</span>
        <Badge variant="outline" className="text-[10px]">
          {comment.auteurType === "proprietaire" ? "Propriétaire" : "Équipe"}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatUtcDayMonthTime(comment.createdAt)}</span>
        {!isLocal && !editing ? (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Modifier"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label="Supprimer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-1 space-y-1.5">
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-1.5">
            <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
              Enregistrer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditValue(comment.message);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-line">{comment.message}</p>
      )}
    </div>
  );
}
