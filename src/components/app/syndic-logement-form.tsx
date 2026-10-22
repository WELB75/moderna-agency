"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enregistrerSyndicLogement } from "@/lib/actions/syndic";

// En-tête du syndic de l'appartement, saisi une fois (sur la première déclaration) et réutilisé
// ensuite. Affiché dépliable quand il est déjà renseigné, pour pouvoir le corriger sans quitter
// la page.
export function SyndicLogementForm({
  villaId,
  villaNom,
  entete,
  residence,
  whatsapp,
}: {
  villaId: string;
  villaNom: string;
  entete: string | null;
  residence: string | null;
  whatsapp: string | null;
}) {
  const router = useRouter();
  const dejaRenseigne = Boolean(entete && residence);
  const [ouvert, setOuvert] = useState(!dejaRenseigne);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await enregistrerSyndicLogement(
          villaId,
          String(formData.get("entete") ?? ""),
          String(formData.get("residence") ?? ""),
          String(formData.get("whatsapp") ?? "")
        );
        toast.success(`En-tête du syndic enregistré pour ${villaNom}.`);
        setOuvert(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(true)} className="print:hidden">
        <Pencil className="h-3.5 w-3.5" />
        Modifier l&apos;en-tête du syndic
      </Button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 print:hidden">
      <div className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-semibold">Syndic de {villaNom}</p>
          <p className="text-xs text-muted-foreground">
            À renseigner une seule fois : ces deux lignes seront reprises sur toutes les déclarations de cet
            appartement.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="entete">En-tête (après « Syndicat des copropriétaires »)</Label>
          <Input
            id="entete"
            name="entete"
            required
            defaultValue={entete ?? ""}
            placeholder="DE L'E.IM CHRIFIA M1-TR3 - RESIDENCE ISLI 2"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="residence">Résidence (dans le texte)</Label>
          <Input id="residence" name="residence" required defaultValue={residence ?? ""} placeholder="ISLI 2" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">WhatsApp du syndic / gardien (plusieurs : séparés par une virgule)</Label>
          <Input id="whatsapp" name="whatsapp" type="text" defaultValue={whatsapp ?? ""} placeholder="+212 6 ..., +212 6 ..." autoComplete="off" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {dejaRenseigne ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)} disabled={isPending}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}
