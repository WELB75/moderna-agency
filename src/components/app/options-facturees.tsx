"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { basculerOptionFacturee, changerDeviseReservation, changerQuantiteOption } from "@/lib/actions/compta-reservation";
import { DEVISES_RESERVATION, codeDevise } from "@/lib/devises";
import { OPTIONS_RAPIDES, formaterMontant, montantLigne, optionIncluse, prixOption, totalFacture, type LigneFacture, type TarifsOptions } from "@/lib/compta-reservation-format";

// Cases à cocher des options facturées, sur la carte du tableau de bord : un clic ajoute la ligne
// avec son prix et sa quantité par défaut (voir OPTIONS_RAPIDES), un second la retire. Le détail
// complet (prix libres, autres postes, règlement) reste sur la fiche de la réservation.
export function OptionsFacturees({
  reservationId,
  lignes,
  devise,
  montantPaye,
  loyerTotal,
  fraisMenage,
  tarifs,
}: {
  reservationId: string;
  lignes: LigneFacture[];
  devise: string;
  montantPaye: number | null;
  loyerTotal: number | null;
  fraisMenage: number | null;
  tarifs: TarifsOptions;
}) {
  const [enCours, startTransition] = useTransition();
  const [actif, setActif] = useState<string | null>(null);

  function agir(cle: string, action: () => Promise<void>) {
    setActif(cle);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      } finally {
        setActif(null);
      }
    });
  }

  const total = lignes.length > 0 ? totalFacture(lignes) : (loyerTotal ?? 0);
  const reste = Math.max(0, Math.round((total - (montantPaye ?? 0)) * 100) / 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options facturées</p>
        <select
          aria-label="Devise de la réservation"
          value={codeDevise(devise)}
          disabled={enCours}
          onChange={(e) => agir("devise", () => changerDeviseReservation(reservationId, e.target.value))}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-60"
        >
          {DEVISES_RESERVATION.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <ul className="space-y-1.5">
        {OPTIONS_RAPIDES.map((o) => {
          const ligne = lignes.find((l) => l.categorie === o.categorie);
          const prix = prixOption(o.categorie, tarifs, fraisMenage);
          // Option sans objet pour ce logement (cuisinière/piscine en appartement) : masquée, sauf si une
          // ligne existe déjà (on doit pouvoir la décocher).
          const incluse = optionIncluse(o.categorie, tarifs) && !ligne;
          if (prix === null && !ligne && !incluse) return null;
          const coche = Boolean(ligne);
          const occupe = enCours && actif === o.categorie;
          return (
            <li
              key={o.categorie}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors ${coche ? "border-primary/40 bg-primary/5" : "border-border"}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={coche}
                aria-label={o.label}
                disabled={enCours || incluse}
                onClick={() => agir(o.categorie, () => basculerOptionFacturee(reservationId, o.categorie))}
                className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-60"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${coche ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                  aria-hidden
                >
                  {coche ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {coche && ligne
                      ? `${ligne.quantite} ${o.parJour ? "jour" + (ligne.quantite > 1 ? "s" : "") : "×"} × ${formaterMontant(ligne.prixUnitaire, devise)}`
                      : incluse
                        ? "Incluse dans le loyer"
                        : `${formaterMontant(prix ?? 0, devise)}${o.parJour ? " / jour" : ""}`}
                    {occupe ? " …" : ""}
                  </span>
                </span>
              </button>

              {coche && ligne ? (
                <>
                  {o.parJour ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Un jour de moins : ${o.label}`}
                        disabled={enCours || ligne.quantite <= 1}
                        onClick={() => agir(o.categorie, () => changerQuantiteOption(reservationId, o.categorie, -1))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Un jour de plus : ${o.label}`}
                        disabled={enCours}
                        onClick={() => agir(o.categorie, () => changerQuantiteOption(reservationId, o.categorie, 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : null}
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">{formaterMontant(montantLigne(ligne), devise)}</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-3 py-2 text-sm">
        <span className="font-semibold">Total facturé {formaterMontant(total, devise)}</span>
        <span className={reste > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
          {reste > 0 ? `Reste à encaisser ${formaterMontant(reste, devise)}` : "Soldé"}
        </span>
      </div>
      <Link href={`/reservations/${reservationId}`} className="inline-block text-xs text-primary underline underline-offset-2">
        Détail financier complet (prix, autres postes, règlement)
      </Link>
    </div>
  );
}
