"use client";

import { useState, useTransition } from "react";
import { Plus, Paperclip, Loader2, X } from "lucide-react";
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
import { createIntervention } from "@/lib/actions/interventions";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";
import { URGENCE_LEVELS, type Urgence } from "@/lib/intervention-urgence";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { CategorieIcon } from "@/components/app/categorie-icon";

export function AddInterventionDialog({
  villas,
  domaines,
  technicians = [],
  contacts = [],
}: {
  villas: { id: string; nom: string; numero: string; domaineId: string | null }[];
  domaines: { id: string; nom: string }[];
  technicians?: { id: string; nom: string; fonction: string }[];
  contacts?: { villaId: string | null; domaineId: string | null; nom: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [villaId, setVillaId] = useState("");
  const [domaineId, setDomaineId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [urgence, setUrgence] = useState<Urgence>("normale");
  const [categorie, setCategorie] = useState<Categorie>("autre");
  const [attachments, setAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedVillaDomaineId = villas.find((v) => v.id === villaId)?.domaineId ?? domaineId;
  // Priorise les contacts déjà rattachés à cette villa/ce domaine (jardinier, pisciniste...)
  // plutôt que la liste générale des prestataires.
  const relevantContacts = contacts.filter(
    (c) => (villaId && c.villaId === villaId) || (selectedVillaDomaineId && c.domaineId === selectedVillaDomaineId)
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const file of files) {
        const blob = await upload(`interventions/new/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
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

  async function handleSubmit(formData: FormData) {
    formData.set("villaId", villaId);
    formData.set("domaineId", domaineId);
    formData.set("technicianId", technicianId);
    formData.set("urgence", urgence);
    formData.set("categorie", categorie);
    formData.set("attachmentUrls", JSON.stringify(attachments.map((a) => a.url)));
    startTransition(async () => {
      try {
        await createIntervention(formData);
        toast.success("Intervention créée.");
        setOpen(false);
        setVillaId("");
        setDomaineId("");
        setTechnicianId("");
        setUrgence("normale");
        setCategorie("autre");
        setAttachments([]);
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
        <DialogHeader>
          <DialogTitle>Nouvelle intervention</DialogTitle>
          <DialogDescription>Suivi d&apos;une intervention, étape par étape.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" placeholder="Ex. Électricien" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="probleme">Problème</Label>
            <Textarea id="probleme" name="probleme" rows={2} placeholder="Ex. Panne électrique dans l'appartement" />
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
            <Label htmlFor="prestataire">Prestataire (si pas dans la liste techniciens)</Label>
            <Input
              id="prestataire"
              name="prestataire"
              list="intervention-prestataire-suggestions"
              placeholder="Ex. Mohamed (électricien)"
            />
            <datalist id="intervention-prestataire-suggestions">
              {relevantContacts.map((c) => (
                <option key={c.nom} value={c.nom}>
                  {CONTACT_ROLE_LABELS[c.role] ?? c.role}
                </option>
              ))}
              {technicians.map((t) => (
                <option key={t.nom} value={t.nom}>
                  {t.fonction}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Contexte, retard, suivi..." />
          </div>
          <div className="space-y-1.5">
            <Label>Photo / vidéo</Label>
            <p className="text-xs text-muted-foreground">
              Nécessaire (avec le problème décrit) pour que l&apos;IA choisisse elle-même un technicien.
            </p>
            <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
              <label className="cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                Ajouter photo / vidéo
                <input
                  type="file"
                  accept="image/*,video/*"
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
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || uploading} className="w-full sm:w-auto">
              {isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
