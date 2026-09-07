"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { Plus, Camera, Loader2, X, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createCashEntry, analyzeCashReceiptPhotos } from "@/lib/actions/caisse";

// Version simplifiée du formulaire de caisse, réservée à l'onglet Brahim — Kamel, 2026-09-07 :
// "là je galère depuis tout à l'heure [...] y a trop de choses". Le formulaire générique
// (AddCashEntryDialog, gardé tel quel pour la caisse société) a trop de champs pour ce cas : chez
// Brahim il n'y a que deux gestes possibles, chacun avec son propre bouton et son propre
// dialogue minimal :
// - "Dépense" : une photo suffit, l'analyse IA se lance toute seule dès qu'elle est envoyée (plus
//   besoin d'un bouton "Analyser" séparé) et remplit montant/villa/description, modifiables si le
//   chiffre est faux.
// - "Argent donné" : juste un montant (+ photo optionnelle en preuve), rien d'autre à choisir.
export function BrahimCashActions({
  villas,
}: {
  villas: { id: string; nom: string; numero: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <BrahimRemiseDialog />
      <BrahimDepenseDialog villas={villas} />
    </div>
  );
}

function BrahimRemiseDialog() {
  const [open, setOpen] = useState(false);
  const [montant, setMontant] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const blob = await upload(`caisse/${Date.now()}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/blob/upload" });
        uploaded.push(blob.url);
      }
      setPhotoUrls((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    const montantNum = Number(montant.replace(",", "."));
    if (!montantNum || montantNum <= 0) {
      toast.error("Indique le montant donné.");
      return;
    }
    const formData = new FormData();
    formData.set("type", "remise");
    formData.set("categorie", "");
    formData.set("caisse", "brahim");
    formData.set("financePar", "societe");
    formData.set("moyenPaiement", "especes");
    formData.set("montant", montant);
    formData.set("devise", "MAD");
    formData.set("description", "");
    formData.set("responsable", "Brahim");
    formData.set("photoUrls", JSON.stringify(photoUrls));
    startTransition(async () => {
      try {
        await createCashEntry(formData);
        toast.success("Argent donné à Brahim enregistré.");
        setOpen(false);
        setMontant("");
        setPhotoUrls([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <HandCoins className="h-4 w-4" />
          Argent donné
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Argent donné à Brahim</DialogTitle>
          <DialogDescription>Juste de quoi prouver que tu lui as remis cette somme.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="remise-montant">Montant (MAD)</Label>
            <Input
              id="remise-montant"
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Photo (optionnel — preuve)</Label>
            {photoUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.map((url, i) => (
                  <div key={url} className="relative h-20 overflow-hidden rounded-md border">
                    <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Ajouter une photo
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending} className="w-full sm:w-auto" onClick={handleSubmit}>
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrahimDepenseDialog({ villas }: { villas: { id: string; nom: string; numero: string }[] }) {
  const [open, setOpen] = useState(false);
  const [montant, setMontant] = useState("");
  const [description, setDescription] = useState("");
  const [villaId, setVillaId] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Envoi + analyse enchaînés : Kamel, 2026-09-07 : "j'ai juste à appuyer sur la photo, ça se
  // scanne automatiquement sans appuyer sur analyser". Un seul geste (choisir/prendre la photo)
  // déclenche upload puis lecture IA, plutôt que deux boutons séparés.
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const blob = await upload(`caisse/${Date.now()}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/blob/upload" });
        uploaded.push(blob.url);
      }
      setPhotoUrls((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi de la photo.");
      setUploading(false);
      return;
    }
    setUploading(false);

    setAnalyzing(true);
    try {
      const result = await analyzeCashReceiptPhotos(uploaded);
      if (result.montant != null) setMontant(String(result.montant));
      if (result.description) setDescription(result.description);
      if (result.villaId) setVillaId(result.villaId);
      if (result.montant == null) toast.warning("Montant pas trouvé sur la photo — complète-le à la main.");
      for (const w of result.warnings) toast.warning(w);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'analyse IA — remplis les champs à la main.");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSubmit() {
    const montantNum = Number(montant.replace(",", "."));
    if (!montantNum || montantNum <= 0) {
      toast.error("Indique le montant de la dépense.");
      return;
    }
    const formData = new FormData();
    formData.set("type", "depense");
    formData.set("categorie", "coursier");
    formData.set("caisse", "brahim");
    formData.set("financePar", "societe");
    formData.set("moyenPaiement", "especes");
    formData.set("montant", montant);
    formData.set("devise", "MAD");
    formData.set("description", description);
    formData.set("responsable", "Brahim");
    formData.set("villaId", villaId);
    formData.set("photoUrls", JSON.stringify(photoUrls));
    startTransition(async () => {
      try {
        await createCashEntry(formData);
        toast.success("Dépense enregistrée.");
        setOpen(false);
        setMontant("");
        setDescription("");
        setVillaId("");
        setPhotoUrls([]);
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
          Dépense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dépense de Brahim</DialogTitle>
          <DialogDescription>Prends le reçu en photo — le montant et la villa se remplissent tout seuls.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Photo du reçu</Label>
            {photoUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.map((url, i) => (
                  <div key={url} className="relative h-20 overflow-hidden rounded-md border">
                    <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" disabled={uploading || analyzing} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {photoUrls.length > 0 ? "Reprendre la photo" : "Prendre une photo"}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            {analyzing ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Lecture du reçu en cours...
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depense-montant">Montant (MAD)</Label>
            <Input
              id="depense-montant"
              type="number"
              step="0.01"
              min="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Se remplit après la photo, ou saisis-le toi-même"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depense-villa">Villa concernée</Label>
            <Select value={villaId} onValueChange={setVillaId}>
              <SelectTrigger className="w-full" id="depense-villa">
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
          <div className="space-y-1.5">
            <Label htmlFor="depense-description">C&apos;est pour quoi</Label>
            <Input
              id="depense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Produit ménager, essence..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={isPending} className="w-full sm:w-auto" onClick={handleSubmit}>
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
