"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Camera, Loader2, X } from "lucide-react";
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
import { createReceipt, createProduct } from "@/lib/actions/courses";

type Product = { id: string; nom: string };

export function AddReceiptDialog({
  domaines,
  products,
}: {
  domaines: { id: string; nom: string }[];
  products: Product[];
}) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [domaineId, setDomaineId] = useState("");
  const [allProducts, setAllProducts] = useState(products);
  const [items, setItems] = useState<{ productId: string; quantite: number }[]>([
    { productId: "", quantite: 1 },
  ]);
  const [newProductName, setNewProductName] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`receipts/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setPhotoUrl(blob.url);
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setUploading(false);
    }
  }

  function updateItem(index: number, patch: Partial<{ productId: string; quantite: number }>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddProduct() {
    const nom = newProductName.trim();
    if (!nom) return;
    try {
      const created = await createProduct(nom);
      if (created) {
        setAllProducts((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
        setNewProductName("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout du produit.");
    }
  }

  function handleSubmit(formData: FormData) {
    if (!photoUrl) {
      toast.error("Ajoute une photo du reçu.");
      return;
    }
    const montantRaw = String(formData.get("montant") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createReceipt({
          photoUrl,
          domaineId: domaineId || null,
          montant: montantRaw ? Number(montantRaw.replace(",", ".")) : null,
          notes: notes || null,
          items,
        });
        toast.success("Reçu enregistré.");
        setOpen(false);
        setPhotoUrl("");
        setDomaineId("");
        setItems([{ productId: "", quantite: 1 }]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nouvel achat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel achat</DialogTitle>
          <DialogDescription>Photo du reçu, domaine et produits achetés.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Photo du reçu</Label>
            <div className="relative overflow-hidden rounded-md border bg-muted">
              {photoUrl ? (
                <div className="relative h-40 w-full">
                  <Image src={photoUrl} alt="" fill sizes="480px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                  Aucune photo
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute bottom-2 right-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {photoUrl ? "Changer" : "Prendre / choisir"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Domaine</Label>
            <Select value={domaineId} onValueChange={setDomaineId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner un domaine" />
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

          <div className="space-y-2">
            <Label>Produits achetés</Label>
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select value={item.productId} onValueChange={(v) => updateItem(index, { productId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Produit" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={item.quantite}
                  onChange={(e) => updateItem(index, { quantite: Number(e.target.value) })}
                  className="w-20"
                />
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, { productId: "", quantite: 1 }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un produit
            </Button>

            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Nouveau produit..."
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddProduct}>
                Créer
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="montant">Montant (DH, optionnel)</Label>
            <Input id="montant" name="montant" type="number" step="0.01" min="0" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || uploading} className="w-full sm:w-auto">
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
