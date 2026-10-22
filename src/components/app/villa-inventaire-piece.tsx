"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { modelePourType, type Groupe } from "@/lib/villa-inventaire-modeles";
import type { ReponseLigne } from "@/db/schema-inventaire-villa";
import {
  enregistrerPieceInventaire,
  supprimerPieceInventaire,
  ajouterPhotoPieceInventaire,
  retirerPhotoPieceInventaire,
} from "@/lib/actions/villa-inventaire";

type Details = Record<string, Record<string, ReponseLigne>>;

export type PieceProps = {
  id: string;
  type: "chambre" | "salle_de_bain" | "zone";
  libelle: string;
  details: Details;
  observations: string | null;
  photos: { url: string; legende: string }[];
};

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        actif ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

export function VillaInventairePiece({ villaId, piece }: { villaId: string; piece: PieceProps }) {
  const [details, setDetails] = useState<Details>(piece.details ?? {});
  const [observations, setObservations] = useState(piece.observations ?? "");
  const [photos, setPhotos] = useState(piece.photos ?? []);
  const [legende, setLegende] = useState("");
  const [modifie, setModifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [pending, startTransition] = useTransition();
  const modele = modelePourType(piece.type);

  function maj(groupe: string, ligne: string, f: (r: ReponseLigne) => ReponseLigne) {
    setDetails((d) => ({ ...d, [groupe]: { ...d[groupe], [ligne]: f(d[groupe]?.[ligne] ?? {}) } }));
    setModifie(true);
  }

  function basculer(groupe: string, ligne: string, choix: string, unique: boolean) {
    maj(groupe, ligne, (r) => {
      const actuel = r.choix ?? [];
      const present = actuel.includes(choix);
      return { ...r, choix: unique ? (present ? [] : [choix]) : present ? actuel.filter((c) => c !== choix) : [...actuel, choix] };
    });
  }

  function enregistrer() {
    startTransition(async () => {
      try {
        await enregistrerPieceInventaire(piece.id, villaId, details, observations);
        setModifie(false);
        toast.success("Enregistré.");
      } catch {
        toast.error("Échec de l'enregistrement.");
      }
    });
  }

  function supprimer() {
    if (!window.confirm(`Supprimer « ${piece.libelle} » de l'inventaire ?`)) return;
    startTransition(async () => {
      try {
        await supprimerPieceInventaire(piece.id, villaId);
      } catch {
        toast.error("Échec de la suppression.");
      }
    });
  }

  async function ajouterPhoto(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fichiers.length === 0) return;
    setEnvoi(true);
    try {
      for (const f of fichiers) {
        const blob = await upload(`villa-inventaire/${villaId}/${piece.id}/${Date.now()}-${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        await ajouterPhotoPieceInventaire(piece.id, villaId, blob.url, legende);
        setPhotos((p) => [...p, { url: blob.url, legende: legende.trim() }]);
      }
      setLegende("");
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setEnvoi(false);
    }
  }

  async function retirerPhoto(url: string) {
    setPhotos((p) => p.filter((x) => x.url !== url));
    try {
      await retirerPhotoPieceInventaire(piece.id, villaId, url);
    } catch {
      toast.error("Échec de la suppression de la photo.");
    }
  }

  function renderGroupe(g: Groupe) {
    const rep = details[g.cle] ?? {};
    return (
      <div key={g.cle} className="space-y-2">
        <h4 className="text-sm font-semibold">{g.titre}</h4>

        {g.mode === "grille" && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-2 py-1.5 font-medium">Élément</th>
                  {g.colonnes!.map((c) => (
                    <th key={c} className="px-2 py-1.5 text-center font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.lignes.map((ligne) => (
                  <tr key={ligne.cle} className="border-t">
                    <td className="px-2 py-1.5">{ligne.libelle}</td>
                    {g.colonnes!.map((c) => (
                      <td key={c} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${ligne.libelle} : ${c}`}
                          checked={rep[ligne.cle]?.choix?.includes(c) ?? false}
                          onChange={() => basculer(g.cle, ligne.cle, c, false)}
                          className="h-4 w-4 accent-foreground"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {g.mode === "questions" && (
          <div className="divide-y rounded-md border">
            {g.lignes.map((ligne) => (
              <div key={ligne.cle} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-xs">{ligne.libelle}</span>
                <div className="flex flex-wrap gap-1">
                  {ligne.choix!.map((c) => (
                    <Puce key={c} actif={rep[ligne.cle]?.choix?.includes(c) ?? false} onClick={() => basculer(g.cle, ligne.cle, c, true)}>
                      {c}
                    </Puce>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {g.mode === "linge" && (
          <div className="divide-y rounded-md border">
            {g.lignes.map((ligne) => (
              <div key={ligne.cle} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-xs">{ligne.libelle}</span>
                <div className="flex flex-wrap items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${ligne.libelle} : quantité`}
                    value={rep[ligne.cle]?.qte ?? ""}
                    onChange={(e) =>
                      maj(g.cle, ligne.cle, (r) => ({ ...r, qte: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                    className="h-7 w-16 px-2 text-xs"
                  />
                  {g.colonnes!.map((c) => (
                    <Puce key={c} actif={rep[ligne.cle]?.choix?.includes(c) ?? false} onClick={() => basculer(g.cle, ligne.cle, c, true)}>
                      {c}
                    </Puce>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      {modele.map(renderGroupe)}

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold">Observations</h4>
        <Textarea
          value={observations}
          onChange={(e) => {
            setObservations(e.target.value);
            setModifie(true);
          }}
          placeholder="Remarques sur cette pièce"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Photos ({photos.length})</h4>
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => (
              <figure key={p.url} className="group relative overflow-hidden rounded-md border">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <Image src={p.url} alt={p.legende || piece.libelle} width={300} height={300} className="aspect-square w-full object-cover" unoptimized />
                </a>
                {p.legende && <figcaption className="px-1.5 py-1 text-[11px] text-muted-foreground">{p.legende}</figcaption>}
                <button
                  type="button"
                  onClick={() => retirerPhoto(p.url)}
                  aria-label="Supprimer la photo"
                  className="absolute right-0 top-0 rounded-bl-md bg-black/60 p-1.5 text-white md:p-0.5 md:opacity-0 md:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </figure>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={legende}
            onChange={(e) => setLegende(e.target.value)}
            placeholder="Légende (ex. tiroir couverts)"
            className="h-8 max-w-xs text-xs"
          />
          <Button asChild variant="outline" size="sm" disabled={envoi}>
            <label className="cursor-pointer">
              {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Ajouter des photos
              <input type="file" accept="image/*" multiple className="sr-only" onChange={ajouterPhoto} />
            </label>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={supprimer} disabled={pending} className="text-destructive">
          <Trash2 className="h-4 w-4" />
          Supprimer la pièce
        </Button>
        <Button type="button" size="sm" onClick={enregistrer} disabled={pending || !modifie}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
