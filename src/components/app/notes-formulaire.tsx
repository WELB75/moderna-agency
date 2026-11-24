"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ajouterNote } from "@/lib/actions/notes-villa";
import { CATEGORIES_NOTES } from "@/lib/notes-villa";

const champ =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function NotesFormulaire({
  logements,
  villaInitiale,
  categorieInitiale,
}: {
  logements: { id: string; nom: string }[];
  villaInitiale: string;
  categorieInitiale: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [villaId, setVillaId] = useState(villaInitiale);
  const [categorie, setCategorie] = useState(categorieInitiale || "general");
  const [texte, setTexte] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState("MAD");

  function envoyer() {
    if (!texte.trim()) return;
    demarrer(async () => {
      try {
        const m = Number(montant.replace(",", "."));
        await ajouterNote({ villaId: villaId || null, categorie, texte, montant: montant && Number.isFinite(m) ? m : null, devise });
        setTexte("");
        setMontant("");
        toast.success("Note ajoutée");
        router.refresh();
      } catch {
        toast.error("La note n'a pas pu être enregistrée.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">Nouvelle note</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <select aria-label="Logement" className={champ} value={villaId} onChange={(e) => setVillaId(e.target.value)}>
          <option value="">Général (aucun logement)</option>
          {logements.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
        <select aria-label="Catégorie" className={champ} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
          {CATEGORIES_NOTES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ce que tu as constaté, fait ou reçu…" rows={3} />
      {categorie === "argent" ? (
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            aria-label="Montant"
            placeholder="Montant (facultatif)"
            className={champ}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
          <select aria-label="Devise" className={`${champ} w-28`} value={devise} onChange={(e) => setDevise(e.target.value)}>
            <option value="MAD">MAD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {categorie === "argent" ? "Note seulement : rien n'est enregistré dans la caisse." : " "}
        </p>
        <Button type="button" onClick={envoyer} disabled={enCours || !texte.trim()}>
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}
