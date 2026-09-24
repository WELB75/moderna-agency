"use client";

import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Camera, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createInterventionByGuestToken } from "@/lib/actions/interventions";

// Formulaire "Signaler un problème" sur la page d'accueil client /bienvenue/[token] — volontairement
// réduit au strict nécessaire (contrairement au formulaire interne ou à TravauxScanForm) : pas de
// choix de catégorie/urgence à faire par le client, juste décrire le souci et prendre une photo.
// L'équipe classe et priorise ensuite depuis l'app interne.
export function GuestReportForm({ token }: { token: string }) {
  const [probleme, setProbleme] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const file of files) {
        const blob = await upload(`bienvenue/${token}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          clientPayload: token,
        });
        uploaded.push({ url: blob.url, name: file.name });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  function handleSubmit() {
    if (!probleme.trim()) {
      toast.error("Décris le problème.");
      return;
    }
    startTransition(async () => {
      try {
        await createInterventionByGuestToken(token, {
          probleme,
          attachmentUrls: attachments.map((a) => a.url),
        });
        setJustCreated(true);
        setTimeout(() => {
          setJustCreated(false);
          setProbleme("");
          setAttachments([]);
        }, 1500);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
      }
    });
  }

  if (justCreated) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="text-sm font-medium text-muted-foreground">C&apos;est noté, merci !</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Textarea
        rows={3}
        value={probleme}
        onChange={(e) => setProbleme(e.target.value)}
        placeholder="Ex. La climatisation de la chambre ne fonctionne pas"
      />
      <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
        <label className="cursor-pointer">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Ajouter une photo (optionnel)
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
      </Button>
      {attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.url} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
              <span className="truncate">{a.name}</span>
              <button type="button" onClick={() => removeAttachment(a.url)} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" disabled={isPending || uploading} className="w-full" onClick={handleSubmit}>
        {isPending ? "Envoi..." : "Envoyer"}
      </Button>
    </div>
  );
}
