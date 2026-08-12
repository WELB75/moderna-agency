"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { Plus, Camera, Loader2, X } from "lucide-react";
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
import { createCashEntry } from "@/lib/actions/caisse";

const MOYEN_LABELS: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement bancaire",
  carte: "Carte bleue",
};

const CATEGORIE_LABELS: Record<string, string> = {
  femmes_menage: "Femmes de ménage",
  cuisinieres: "Cuisinières",
  jardinier: "Jardinier / Brahim",
  coursier: "Coursier / Brahim",
  hebergement: "Hébergement (réparation, achat, mobilier...)",
  autre: "Autre",
};

export function AddCashEntryDialog({
  villas,
  reservations,
  moyenPaiement = "especes",
  lockedCaisse = "societe",
}: {
  villas: { id: string; nom: string; numero: string }[];
  reservations: { id: string; guestName: string; villaId: string | null; villaNom: string | null; villaNumero: string | null }[];
  moyenPaiement?: "especes" | "virement" | "carte";
  // La caisse (société ou Brahim) est fixée par l'onglet dans lequel ce dialogue est ouvert —
  // pas un choix libre dans le formulaire, pour ne jamais mélanger les deux (demande du patron,
  // 2026-08-12 : la caisse Brahim doit être totalement séparée, pas juste un filtre).
  lockedCaisse?: "societe" | "brahim";
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("remise");
  const [categorie, setCategorie] = useState("");
  const [financePar, setFinancePar] = useState("societe");
  const [devise, setDevise] = useState("MAD");
  const [villaId, setVillaId] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleReservationChange(id: string) {
    setReservationId(id);
    const resa = reservations.find((r) => r.id === id);
    if (resa?.villaId) setVillaId(resa.villaId);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const blob = await upload(`caisse/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        uploaded.push(blob.url);
      }
      setPhotoUrls((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Échec de l'envoi d'une photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    formData.set("type", type);
    // La caisse Brahim ne sert qu'à ses courses (bons) — une seule catégorie possible,
    // pas besoin de choisir parmi les catégories de la caisse société (jardinier, ménage...).
    formData.set("categorie", type === "depense" ? (lockedCaisse === "brahim" ? "coursier" : categorie) : "");
    formData.set("caisse", lockedCaisse);
    formData.set("financePar", type === "depense" ? financePar : "societe");
    formData.set("moyenPaiement", moyenPaiement);
    formData.set("devise", devise);
    formData.set("photoUrls", JSON.stringify(photoUrls));
    startTransition(async () => {
      try {
        await createCashEntry(formData);
        toast.success("Mouvement enregistré.");
        setOpen(false);
        setPhotoUrls([]);
        setVillaId("");
        setReservationId("");
        setFinancePar("societe");
        setCategorie("");
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
          Mouvement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Nouveau mouvement · {lockedCaisse === "brahim" ? "Brahim" : MOYEN_LABELS[moyenPaiement]}
          </DialogTitle>
          <DialogDescription>Enregistre l&apos;argent confié, dépensé ou restitué.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type de mouvement</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remise">Argent confié (remise)</SelectItem>
                <SelectItem value="loyer">Loyer reçu d&apos;un client</SelectItem>
                <SelectItem value="extra">Extra reçu d&apos;un client (petit-déj, options...)</SelectItem>
                <SelectItem value="depense">Dépense</SelectItem>
                <SelectItem value="restitution">Restitution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "depense" ? (
            <>
              {lockedCaisse !== "brahim" ? (
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={categorie} onValueChange={setCategorie} required>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIE_LABELS)
                        .filter(([value]) => value !== "coursier")
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {categorie === "hebergement" ? (
                    <p className="text-xs text-muted-foreground">
                      Pense à sélectionner le bien concerné ci-dessous.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {lockedCaisse === "societe" ? (
                <div className="space-y-1.5">
                  <Label>Financé par</Label>
                  <Select value={financePar} onValueChange={setFinancePar}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="societe">Société (compte dans ce qu&apos;elle te doit)</SelectItem>
                      <SelectItem value="loyers_perso">Mes loyers perso (pas de remboursement dû)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="montant">Montant</Label>
              <Input id="montant" name="montant" type="number" step="0.01" min="0" required />
            </div>
            <div className="space-y-1.5">
              <Label>Devise</Label>
              <Select value={devise} onValueChange={setDevise}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAD">MAD (dirham)</SelectItem>
                  <SelectItem value="EUR">EUR (euro)</SelectItem>
                  <SelectItem value="USD">USD (dollar)</SelectItem>
                  <SelectItem value="GBP">GBP (livre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reservationId">Client / réservation concernée</Label>
            <Select name="reservationId" value={reservationId} onValueChange={handleReservationChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Optionnel — pas de client précis" />
              </SelectTrigger>
              <SelectContent>
                {reservations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.guestName}
                    {r.villaNom ? ` — ${r.villaNom} (n°${r.villaNumero})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="villaId">Villa concernée</Label>
            <Select name="villaId" value={villaId} onValueChange={setVillaId}>
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
          <div className="space-y-1.5">
            <Label htmlFor="responsable">Personne concernée</Label>
            <Input
              id="responsable"
              name="responsable"
              placeholder="Ex. Brahim Jardinier"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">
              {type === "loyer" ? "Répartition du montant" : "Description"}
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              placeholder={
                type === "loyer"
                  ? "Ex. Nuitées : 70 000 DH · Cuisine : 20 000 DH · Ménage : 10 000 DH"
                  : "Ex. courses ménage villa 12"
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Photos (reçus, preuves)</Label>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Ajouter une photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
