"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajouterReserveProprietaire } from "@/lib/actions/reserves-proprietaire";

export type ReserveProprietaire = { id: string; titre: string; etape: "signale" | "contacte" | "planifie" | "en_cours" | "termine" };

const ETAPE: Record<ReserveProprietaire["etape"], { label: string; classe: string }> = {
  signale: { label: "À traiter", classe: "bg-amber-100 text-amber-800" },
  contacte: { label: "Pris en charge", classe: "bg-sky-100 text-sky-800" },
  planifie: { label: "Planifié", classe: "bg-sky-100 text-sky-800" },
  en_cours: { label: "En cours", classe: "bg-sky-100 text-sky-800" },
  termine: { label: "Terminé", classe: "bg-emerald-100 text-emerald-800" },
};

// Liste des réserves du propriétaire + champ d'ajout (page publique /cal/[token]).
export function ReservesProprietaire({ token, reserves }: { token: string; reserves: ReserveProprietaire[] }) {
  const [texte, setTexte] = useState("");
  const [isPending, startTransition] = useTransition();

  function envoyer() {
    startTransition(async () => {
      try {
        const res = await ajouterReserveProprietaire(token, texte);
        if (!res.ok) {
          toast.error(res.erreur);
          return;
        }
        setTexte("");
        toast.success("Réserve ajoutée.");
      } catch {
        toast.error("Erreur lors de l'envoi.");
      }
    });
  }

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Réserves</h2>
        <p className="text-xs text-muted-foreground">
          Ce qui est à réparer ou à vérifier dans votre logement. Ajoutez-en une, notre équipe s&apos;en occupe.
        </p>
      </div>
      {reserves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune réserve pour le moment.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {reserves.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={r.etape === "termine" ? "text-muted-foreground line-through" : "font-medium"}>{r.titre}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ETAPE[r.etape].classe}`}>{ETAPE[r.etape].label}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
      >
        <Input
          className="h-11 md:h-9"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Ex. La porte du garage ne ferme plus"
          maxLength={200}
          aria-label="Nouvelle réserve"
        />
        <Button type="submit" className="h-11 shrink-0 md:h-9" disabled={isPending || !texte.trim()}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </form>
    </section>
  );
}
