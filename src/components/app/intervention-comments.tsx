"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Send, Pencil, Trash2, Check, X, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { formatUtcDayMonthTime } from "@/lib/now";
import { cn } from "@/lib/utils";
import {
  addInterventionComment,
  updateInterventionComment,
  deleteInterventionComment,
} from "@/lib/actions/intervention-comments";

const STAFF_AUTEURS = new Set(["Kamel", "Rida", "Imad"]);

export type CommentRow = {
  id: string;
  auteur: string;
  auteurType: string;
  message: string;
  audioUrl?: string | null;
  attachmentUrls?: string[] | null;
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
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Photos/vidéos/audio joints à l'échange — Kamel, 2026-10-01 : "met la possibilité de mettre
  // des photos dans la conversation, vidéo et audio aussi". Même route d'upload que les photos
  // d'intervention elle-même (voir api/blob/upload), avec l'id de l'intervention comme jeton
  // d'autorisation côté lien public (pas de compte, pas de token séparé pour ce lien-là).
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const blob = await upload(`interventions/${interventionId}/echange-${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          clientPayload: interventionId,
        });
        uploaded.push(blob.url);
      }
      setPendingAttachments((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi du fichier.");
    } finally {
      setUploading(false);
    }
  }

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    const finalAuteur = authorOptions && authorOptions.length > 1 ? selectedAuteur : auteur;
    // Kamel/Rida/Imad écrivent toujours pour Moderna Agency, même depuis un lien partagé
    // publiquement — "Propriétaire" et "Technicien" restent les tiers externes réels.
    const finalAuteurType: "staff" | "proprietaire" = STAFF_AUTEURS.has(finalAuteur) ? "staff" : auteurType;
    const attachments = pendingAttachments;
    startTransition(async () => {
      try {
        await addInterventionComment(interventionId, finalAuteur, finalAuteurType, trimmed, attachments);
        setLocalComments((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            auteur: finalAuteur,
            auteurType: finalAuteurType,
            message: trimmed || "Pièce jointe",
            attachmentUrls: attachments,
            createdAt: new Date(),
          },
        ]);
        setMessage("");
        setPendingAttachments([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleUpdated(id: string, newMessage: string, newAuteur: string, newAuteurType: string) {
    setLocalComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, message: newMessage, auteur: newAuteur, auteurType: newAuteurType } : c))
    );
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
              authorOptions={authorOptions && authorOptions.length > 1 ? authorOptions : undefined}
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
      {pendingAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pendingAttachments.map((url) => (
            <div key={url} className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
              <span className="max-w-32 truncate">{url.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((u) => u !== url))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Retirer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Joindre une photo, vidéo ou audio"
          title="Joindre une photo, vidéo ou audio"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Écrire un message..."
          rows={2}
          className="flex-1"
        />
        <Button type="button" size="icon" disabled={isPending || uploading} onClick={handleSend}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CommentItem({
  comment,
  onUpdated,
  onDeleted,
  onUpdate = updateInterventionComment,
  onDelete = deleteInterventionComment,
  authorOptions,
}: {
  comment: CommentRow;
  onUpdated: (id: string, message: string, auteur: string, auteurType: string) => void;
  onDeleted: (id: string) => void;
  onUpdate?: (commentId: string, message: string, auteur?: string, auteurType?: "staff" | "proprietaire") => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  // Présent uniquement là où il est utile de changer le nom après coup (message saisi sous le
  // mauvais profil) — absent ailleurs (ex. commentaires paiement), le champ nom reste masqué et
  // rien ne change par rapport à avant. Kamel, 2026-10-01 : "dans modifier ici j'aimerais avoir
  // aussi l'option de choisir les noms".
  authorOptions?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.message);
  const [editAuteur, setEditAuteur] = useState(comment.auteur);
  const [isPending, startTransition] = useTransition();
  const isLocal = comment.id.startsWith("local-");

  function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        if (authorOptions) {
          const finalAuteurType: "staff" | "proprietaire" = STAFF_AUTEURS.has(editAuteur) ? "staff" : "proprietaire";
          await onUpdate(comment.id, trimmed, editAuteur, finalAuteurType);
          onUpdated(comment.id, trimmed, editAuteur, finalAuteurType);
        } else {
          await onUpdate(comment.id, trimmed);
          onUpdated(comment.id, trimmed, comment.auteur, comment.auteurType);
        }
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await onDelete(comment.id);
        onDeleted(comment.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="rounded-md bg-muted/40 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{comment.auteur}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            comment.auteurType !== "proprietaire" && "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400"
          )}
        >
          {comment.auteurType === "proprietaire" ? "Propriétaire" : "Moderna Agency"}
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
          {authorOptions ? (
            <Select value={editAuteur} onValueChange={setEditAuteur}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(authorOptions.includes(editAuteur) ? authorOptions : [editAuteur, ...authorOptions]).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
                setEditAuteur(comment.auteur);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-0.5 whitespace-pre-line">{comment.message}</p>
          {comment.audioUrl ? (
            <audio controls src={comment.audioUrl} className="mt-1.5 h-9 w-full max-w-xs" />
          ) : null}
          {comment.attachmentUrls && comment.attachmentUrls.length > 0 ? (
            <div className="mt-1.5">
              <InterventionAttachments urls={comment.attachmentUrls} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
