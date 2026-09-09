"use client";

import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Camera, Loader2, Sparkles, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorieIcon } from "@/components/app/categorie-icon";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { URGENCE_LEVELS, type Urgence } from "@/lib/intervention-urgence";
import { analyzeInterventionPhotoByToken, createInterventionByToken } from "@/lib/actions/interventions";

// Onglet "Ajouter" du lien /travaux/[token] — Kamel, 2026-09-09 : "je veux un formulaire propre
// avec ia j'ai juste a prendre en photo, ou video, ou importer". Même principe que le formulaire
// interne (add-intervention-dialog.tsx) et les reçus de Brahim en caisse : une photo suffit, le
// souci/catégorie/urgence se remplissent tout seuls.
export function TravauxScanForm({ token }: { token: string }) {
  const [probleme, setProbleme] = useState("");
  const [categorie, setCategorie] = useState<Categorie>("autre");
  const [urgence, setUrgence] = useState<Urgence>("normale");
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: { url: string; name: string }[] = [];
    try {
      for (const file of files) {
        const blob = await upload(`travaux/${token}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          clientPayload: token,
        });
        uploaded.push({ url: blob.url, name: file.name });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi.");
      setUploading(false);
      return;
    }
    setUploading(false);

    // Ne remplace jamais un souci déjà tapé à la main.
    const firstPhotoIndex = files.findIndex((f) => f.type.startsWith("image/"));
    if (firstPhotoIndex === -1 || probleme.trim()) return;

    setAnalyzing(true);
    try {
      const result = await analyzeInterventionPhotoByToken(token, uploaded[firstPhotoIndex].url);
      if (result.probleme) setProbleme(result.probleme);
      setCategorie(result.categorie as Categorie);
      setUrgence(result.urgence);
      if (!result.probleme) toast.warning("Problème pas clairement identifiable sur la photo — décris-le toi-même.");
      for (const w of result.warnings) toast.warning(w);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'analyse IA — remplis les champs à la main.");
    } finally {
      setAnalyzing(false);
    }
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  function handleSubmit() {
    if (!probleme.trim()) {
      toast.error("Décris le problème (ou prends une photo pour le remplir automatiquement).");
      return;
    }
    startTransition(async () => {
      try {
        await createInterventionByToken(token, {
          probleme,
          categorie,
          urgence,
          attachmentUrls: attachments.map((a) => a.url),
        });
        setJustCreated(true);
        setTimeout(() => {
          setJustCreated(false);
          setProbleme("");
          setCategorie("autre");
          setUrgence("normale");
          setAttachments([]);
        }, 1200);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  if (justCreated) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <CheckCircle2 className="h-14 w-14 text-emerald-500" />
        <p className="text-sm font-medium text-muted-foreground">Ajouté et envoyé.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Photo / vidéo</Label>
        <p className="text-xs text-muted-foreground">
          Une photo suffit : le problème, la catégorie et l&apos;urgence se remplissent tout seuls.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={uploading || analyzing} asChild>
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Prendre / ajouter une photo ou vidéo
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={uploading || analyzing}
              onChange={handleFileChange}
            />
          </label>
        </Button>
        {analyzing ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 animate-pulse" />
            Analyse de la photo en cours...
          </p>
        ) : null}
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="travaux-probleme">Problème</Label>
        <Textarea
          id="travaux-probleme"
          rows={3}
          value={probleme}
          onChange={(e) => setProbleme(e.target.value)}
          placeholder="Se remplit après la photo, ou décris-le toi-même"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Catégorie</Label>
          <Select value={categorie} onValueChange={(v) => setCategorie(v as Categorie)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  <span className="flex items-center gap-1.5">
                    <CategorieIcon categorie={c.key} className="h-3.5 w-3.5" />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Urgence</Label>
          <Select value={urgence} onValueChange={(v) => setUrgence(v as Urgence)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCE_LEVELS.slice()
                .reverse()
                .map((u) => (
                  <SelectItem key={u.key} value={u.key}>
                    {u.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" disabled={isPending || uploading || analyzing} className="w-full" onClick={handleSubmit}>
        {isPending ? "Envoi..." : "Ajouter"}
      </Button>
    </div>
  );
}
