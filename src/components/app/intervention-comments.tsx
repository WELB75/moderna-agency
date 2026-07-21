"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatUtcDayMonthTime } from "@/lib/now";
import { addInterventionComment } from "@/lib/actions/intervention-comments";

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
}: {
  interventionId: string;
  comments: CommentRow[];
  auteur: string;
  auteurType: "staff" | "proprietaire";
}) {
  const [localComments, setLocalComments] = useState(comments);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await addInterventionComment(interventionId, auteur, auteurType, trimmed);
        setLocalComments((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, auteur, auteurType, message: trimmed, createdAt: new Date() },
        ]);
        setMessage("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Échanges</p>
      {localComments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message pour l&apos;instant.</p>
      ) : (
        <div className="space-y-2">
          {localComments.map((c) => (
            <div key={c.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{c.auteur}</span>
                <Badge variant="outline" className="text-[10px]">
                  {c.auteurType === "proprietaire" ? "Propriétaire" : "Équipe"}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatUtcDayMonthTime(c.createdAt)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-line">{c.message}</p>
            </div>
          ))}
        </div>
      )}
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
