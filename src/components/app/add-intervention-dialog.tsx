"use client";

import { useState, useTransition } from "react";
import { Plus, Paperclip, Loader2, X, CheckCircle2, Sparkles } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createIntervention,
  createInterventionByMaintenanceToken,
  analyzeInterventionPhotoUrl,
  analyzeInterventionPhotoByMaintenanceToken,
} from "@/lib/actions/interventions";
import { URGENCE_LEVELS, type Urgence } from "@/lib/intervention-urgence";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { CategorieIcon } from "@/components/app/categorie-icon";

export function AddInterventionDialog({
  villas,
  domaines,
  technicians = [],
  token,
}: {
  villas: { id: string; nom: string; numero: string; domaineId: string | null }[];
  domaines: { id: string; nom: string }[];
  technicians?: { id: string; nom: string; fonction: string }[];
  contacts?: { villaId: string | null; domaineId: string | null; nom: string; role: string }[];
  // Présent uniquement sur l'espace maintenance public (/m/[token]) — voir intervention-card.tsx.
  token?: string;
}) {
  const [open, setOpen] = useState(false);
  const [villaId, setVillaId] = useState("");
  const [domaineId, setDomaineId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [urgence, setUrgence] = useState<Urgence>("normale");
  const [categorie, setCategorie] = useState<Categorie>("autre");
  const [probleme, setProbleme] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Analyse enchaînée dès l'envoi d'une photo — Kamel, 2026-09-09 : "j'ai juste a prendre en
  // photo, ou video, ou importer" : un seul geste déclenche l'upload puis la lecture IA (comme
  // pour les reçus de Brahim en caisse), pas un bouton "Analyser" séparé. Les vidéos ne sont pas
  // analysables par la vision IA (image fixe uniquement) — seule la première photo sert de base.
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: { url: string; name: string }[] = [];
    try {
      for (const file of files) {
        const blob = await upload(`interventions/new/${Date.now()}-${file.name}`, file, {
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

    // Ne remplace jamais un souci déjà tapé à la main — seulement pré-remplir quand le champ est
    // encore vide, pour ne jamais écraser une description volontaire.
    const firstPhotoIndex = files.findIndex((f) => f.type.startsWith("image/"));
    if (firstPhotoIndex === -1 || probleme.trim()) return;

    setAnalyzing(true);
    try {
      const result = token
        ? await analyzeInterventionPhotoByMaintenanceToken(token, uploaded[firstPhotoIndex].url)
        : await analyzeInterventionPhotoUrl(uploaded[firstPhotoIndex].url);
      if (result.probleme) setProbleme(result.probleme);
      setCategorie(result.categorie);
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

  async function handleSubmit(formData: FormData) {
    // Plus de champ "Titre" séparé : le souci décrit sert directement de titre — Kamel,
    // 2026-08-19 : "on met direct le souci".
    const probleme = String(formData.get("probleme") ?? "").trim();
    formData.set("titre", probleme);
    formData.set("villaId", villaId);
    formData.set("domaineId", domaineId);
    formData.set("technicianId", technicianId);
    formData.set("urgence", urgence);
    formData.set("categorie", categorie);
    formData.set("attachmentUrls", JSON.stringify(attachments.map((a) => a.url)));
    startTransition(async () => {
      try {
        if (token) await createInterventionByMaintenanceToken(token, formData);
        else await createIntervention(formData);
        setJustCreated(true);
        setTimeout(() => {
          setOpen(false);
          setJustCreated(false);
          setVillaId("");
          setDomaineId("");
          setTechnicianId("");
          setUrgence("normale");
          setCategorie("autre");
          setProbleme("");
          setAttachments([]);
        }, 1100);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nouvelle intervention
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {justCreated ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <CheckCircle2 className="h-14 w-14 animate-in zoom-in-50 fade-in-0 text-emerald-500 duration-500" />
            <p className="animate-in fade-in-0 text-sm font-medium text-muted-foreground delay-150 duration-500">
              Intervention créée et envoyée
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nouvelle intervention</DialogTitle>
              <DialogDescription>Suivi d&apos;une intervention, étape par étape.</DialogDescription>
            </DialogHeader>
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="probleme">Souci</Label>
                <Textarea
                  id="probleme"
                  name="probleme"
                  rows={3}
                  value={probleme}
                  onChange={(e) => setProbleme(e.target.value)}
                  placeholder="Se remplit après la photo, ou décris-le toi-même"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Domaine</Label>
              <Select value={domaineId} onValueChange={setDomaineId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  {domaines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Villa / appartement</Label>
              <Select value={villaId} onValueChange={setVillaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  {villas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nom} (n°{v.numero})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lieu">Lieu (si pas une villa précise)</Label>
            <Input id="lieu" name="lieu" placeholder="Ex. Résidence Noria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Technicien</Label>
              <Select value={technicianId || "__none__"} onValueChange={(v) => setTechnicianId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Laisser vide : l'IA choisit dès qu'une photo est ajoutée" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Laisser vide (l&apos;IA choisit)</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nom} ({t.fonction})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Contexte, retard, suivi..." />
          </div>
          <div className="space-y-1.5">
            <Label>Photo / vidéo</Label>
            <p className="text-xs text-muted-foreground">
              Une photo suffit : le souci, la catégorie et l&apos;urgence se remplissent tout seuls (et l&apos;IA choisit
              un technicien une fois le problème décrit).
            </p>
            <Button type="button" variant="outline" size="sm" disabled={uploading || analyzing} asChild>
              <label className="cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
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
              <DialogFooter>
                <Button type="submit" disabled={isPending || uploading} className="w-full sm:w-auto">
                  {isPending ? "Création..." : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
