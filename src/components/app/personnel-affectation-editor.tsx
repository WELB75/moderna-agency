"use client";

import { useOptimistic, useState, useTransition } from "react";
import { X, Check, Circle, Coffee, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addPersonnelAffectation,
  removePersonnelAffectation,
  toggleAffectationFait,
  updateAffectationJours,
  updateAffectationAvecDejeuner,
  markAffectationPaidSolo,
} from "@/lib/actions/personnel";
import {
  TARIF_MENAGE,
  TARIF_CUISINE_PETIT_DEJEUNER,
  TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER,
  estPayeParProprietaire,
} from "@/lib/personnel-tarifs";

export type PersonnelAssigne = {
  affectationId: string;
  personnelId: string;
  nom: string;
  faitAt: Date | null;
  nbJours: number | null;
  avecDejeuner: boolean;
  payeAt: Date | null;
};

type OptimisticAction =
  | { type: "add"; personnelId: string; nom: string }
  | { type: "remove"; affectationId: string }
  | { type: "toggleFait"; affectationId: string; fait: boolean }
  | { type: "setJours"; affectationId: string; nbJours: number | null }
  | { type: "toggleAvecDejeuner"; affectationId: string; avecDejeuner: boolean }
  | { type: "markPaid"; affectationId: string };

// Plusieurs personnes peuvent être affectées au même séjour (ex. 2-3 femmes de ménage pour
// une grande villa) : chacune apparaît en badge retirable, et le menu déroulant ne propose que
// celles qui ne sont pas déjà affectées. Le ménage se confirme fait (preuve pour les stats) ;
// la cuisine peut préciser un nombre de jours si ce n'était pas tout le séjour, et si elle fait
// aussi le déjeuner (tarif différent).
//
// La liste passée en `assigned` est mise à jour de façon optimiste : chaque clic doit se voir
// tout de suite, sans attendre l'aller-retour serveur + revalidation de la page, pour pouvoir
// enchaîner l'affectation de la personne suivante sans interruption.
export function PersonnelAffectationEditor({
  reservationId,
  role,
  label,
  assigned,
  options,
  payeParProprietaireNoms = [],
  moment = "unique",
}: {
  reservationId: string;
  role: "menage" | "cuisine";
  label: string;
  assigned: PersonnelAssigne[];
  options: { id: string; nom: string }[];
  // Noms des personnes dont le ménage/cuisine est payé directement par le propriétaire pour
  // cette villa : aucun montant ni bouton de paiement ne doit apparaître pour elles côté
  // agence. Les autres personnes affectées à la même réservation restent payées normalement.
  payeParProprietaireNoms?: string[];
  // Ménage uniquement : "sejour" (pendant le séjour, à la demande du client) vs "depart" (ménage
  // de fin de séjour, souvent une équipe différente) — la MÊME personne peut être affectée aux
  // deux pour la même réservation. "unique" (défaut) pour la cuisine, sans objet.
  moment?: "sejour" | "depart" | "unique";
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticAssigned, applyOptimistic] = useOptimistic(assigned, (state, action: OptimisticAction) => {
    switch (action.type) {
      case "add":
        return [
          ...state,
          {
            affectationId: `optimistic-${action.personnelId}`,
            personnelId: action.personnelId,
            nom: action.nom,
            faitAt: null,
            nbJours: null,
            avecDejeuner: false,
            payeAt: null,
          },
        ];
      case "remove":
        return state.filter((a) => a.affectationId !== action.affectationId);
      case "toggleFait":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, faitAt: action.fait ? new Date() : null } : a));
      case "setJours":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, nbJours: action.nbJours } : a));
      case "toggleAvecDejeuner":
        return state.map((a) =>
          a.affectationId === action.affectationId ? { ...a, avecDejeuner: action.avecDejeuner } : a
        );
      case "markPaid":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, payeAt: new Date() } : a));
      default:
        return state;
    }
  });

  const assignedIds = new Set(optimisticAssigned.map((a) => a.personnelId));
  const availableOptions = options.filter((o) => !assignedIds.has(o.id));

  function handleAdd(personnelId: string) {
    const option = options.find((o) => o.id === personnelId);
    if (!option) return;
    startTransition(async () => {
      applyOptimistic({ type: "add", personnelId, nom: option.nom });
      try {
        await addPersonnelAffectation(reservationId, personnelId, moment);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleRemove(affectationId: string) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", affectationId });
      try {
        await removePersonnelAffectation(affectationId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleToggleFait(affectationId: string, fait: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "toggleFait", affectationId, fait });
      try {
        await toggleAffectationFait(affectationId, fait);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleSetJours(affectationId: string, nbJours: number | null) {
    startTransition(async () => {
      applyOptimistic({ type: "setJours", affectationId, nbJours });
      try {
        await updateAffectationJours(affectationId, nbJours);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleToggleAvecDejeuner(affectationId: string, avecDejeuner: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "toggleAvecDejeuner", affectationId, avecDejeuner });
      try {
        await updateAffectationAvecDejeuner(affectationId, avecDejeuner);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleMarkPaid(affectationId: string) {
    startTransition(async () => {
      applyOptimistic({ type: "markPaid", affectationId });
      try {
        const result = await markAffectationPaidSolo(affectationId);
        if (result.ok) {
          toast.success("Marquée payée et ajoutée à la caisse.");
        } else {
          toast.error(result.message ?? "Erreur.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {optimisticAssigned.map((a) =>
          role === "menage" ? (
            <MenageBadge
              key={a.affectationId}
              a={a}
              disabled={isPending}
              onToggleFait={handleToggleFait}
              onRemove={handleRemove}
              onSetJours={handleSetJours}
              montantVisible={!estPayeParProprietaire(payeParProprietaireNoms, a.nom)}
            />
          ) : (
            <CuisineBadge
              key={a.affectationId}
              a={a}
              disabled={isPending}
              onRemove={handleRemove}
              onSetJours={handleSetJours}
              onToggleAvecDejeuner={handleToggleAvecDejeuner}
              onMarkPaid={handleMarkPaid}
              montantVisible={!estPayeParProprietaire(payeParProprietaireNoms, a.nom)}
            />
          )
        )}
        {availableOptions.length > 0 ? (
          <Select value="" onValueChange={handleAdd} disabled={isPending}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="+ Ajouter" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : options.length === 0 ? (
          <span className="text-xs text-muted-foreground">Personne dans l&apos;équipe (onglet Équipe)</span>
        ) : (
          <span className="text-xs text-muted-foreground">Toute l&apos;équipe est déjà affectée ici</span>
        )}
      </div>
    </div>
  );
}

// Bouton (pas juste un badge à plat) pour que ce soit visuellement clair que c'est cliquable :
// gris avec cercle vide = pas encore fait, noir plein avec coche = confirmé, comme un
// interrupteur — même traitement neutre que le reste de l'app, pas de couleur sémantique ici.
// Le nombre de jours (comme la cuisine) couvre le cas d'une femme de ménage sollicitée PENDANT
// le séjour (pas seulement le nettoyage de fin de séjour) — vide = 1 jour, comportement d'origine
// inchangé. Kamel, 2026-08-06 : "certains veulent cuisiniere et femme de menage", même tarif
// journalier que le ménage de fin de séjour (200 MAD/jour).
function MenageBadge({
  a,
  disabled,
  onToggleFait,
  onRemove,
  onSetJours,
  montantVisible,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  onToggleFait: (affectationId: string, fait: boolean) => void;
  onRemove: (affectationId: string) => void;
  onSetJours: (affectationId: string, nbJours: number | null) => void;
  montantVisible: boolean;
}) {
  const fait = Boolean(a.faitAt);
  const paye = Boolean(a.payeAt);
  const [jours, setJours] = useState(a.nbJours != null ? String(a.nbJours) : "");

  function handleBlur() {
    const parsed = jours.trim() === "" ? null : Math.max(1, parseInt(jours, 10));
    if (parsed === a.nbJours || (parsed === null && a.nbJours === null)) return;
    onSetJours(a.affectationId, Number.isNaN(parsed as number) ? null : parsed);
  }

  const joursApercu = jours.trim() === "" ? 1 : Math.max(1, parseInt(jours, 10) || 1);
  const montantApercu = joursApercu * TARIF_MENAGE;

  return (
    <div className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background pl-0.5 pr-2.5 text-[0.8rem] font-medium">
      <Button
        type="button"
        variant={fait ? "default" : "outline"}
        size="sm"
        onClick={() => onToggleFait(a.affectationId, !fait)}
        disabled={disabled}
        className="h-6"
        title={fait ? "Confirmé fait — cliquer pour annuler" : "Cliquer pour confirmer que le travail a été fait"}
      >
        {fait ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        {a.nom}
      </Button>
      <Input
        type="number"
        min={1}
        value={jours}
        onChange={(e) => setJours(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled || paye}
        placeholder="1"
        title="Nombre de jours travaillés (si sollicitée pendant le séjour, pas seulement au départ)"
        className="h-5 w-7 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
      />
      <span className="text-muted-foreground">{joursApercu > 1 ? "jours" : "jour"}</span>
      {montantVisible ? (
        <span className="text-muted-foreground">· {montantApercu} MAD</span>
      ) : (
        <span className="text-muted-foreground" title="Payé directement par le propriétaire, pas par l'agence">
          · Payé par proprio
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Retirer ${a.nom}`}
        title="Retirer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CuisineBadge({
  a,
  disabled,
  onRemove,
  onSetJours,
  onToggleAvecDejeuner,
  onMarkPaid,
  montantVisible,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  onRemove: (affectationId: string) => void;
  onSetJours: (affectationId: string, nbJours: number | null) => void;
  onToggleAvecDejeuner: (affectationId: string, avecDejeuner: boolean) => void;
  onMarkPaid: (affectationId: string) => void;
  montantVisible: boolean;
}) {
  const [jours, setJours] = useState(a.nbJours != null ? String(a.nbJours) : "");
  const paye = Boolean(a.payeAt);

  function handleBlur() {
    const parsed = jours.trim() === "" ? null : Math.max(1, parseInt(jours, 10));
    if (parsed === a.nbJours || (parsed === null && a.nbJours === null)) return;
    onSetJours(a.affectationId, Number.isNaN(parsed as number) ? null : parsed);
  }

  // Aperçu du montant en direct (pas seulement une fois payé) : 1 jour par défaut si le nombre
  // de jours n'est pas encore précisé (séjour complet), pour toujours voir un montant concret
  // dès qu'on choisit le niveau de service. Le vrai montant (et l'éligibilité au paiement) est
  // recalculé côté serveur au clic sur "payer", pas déduit de cet aperçu.
  const joursApercu = jours.trim() === "" ? 1 : Math.max(1, parseInt(jours, 10) || 1);
  const tarifJour = a.avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER;
  const montantApercu = joursApercu * tarifJour;

  return (
    <div className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium">
      {a.nom}
      <Input
        type="number"
        min={1}
        value={jours}
        onChange={(e) => setJours(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled || paye}
        placeholder="nb"
        title="Nombre de jours si ce n'est pas tout le séjour"
        className="h-5 w-8 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
      />
      <span className="text-muted-foreground">{jours === "1" ? "jour" : "jours"}</span>
      {montantVisible ? (
        <button
          type="button"
          onClick={() => onMarkPaid(a.affectationId)}
          disabled={disabled || paye}
          className={cn(
            "flex items-center gap-1 border px-1.5 py-0.5 text-xs",
            paye
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted"
          )}
          title={paye ? "Payée — déjà ajoutée à la caisse" : `Cliquer pour marquer payée (${montantApercu} MAD) — ajouté directement à la caisse`}
        >
          {paye ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
          {paye ? "Payée" : `${montantApercu} MAD`}
        </button>
      ) : (
        <span
          className="border border-border bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground"
          title="Payé directement par le propriétaire, pas par l'agence"
        >
          Payé par proprio
        </span>
      )}
      <button
        type="button"
        onClick={() => onToggleAvecDejeuner(a.affectationId, !a.avecDejeuner)}
        disabled={disabled || paye}
        className={cn(
          "flex items-center gap-1 border px-1.5 py-0.5 text-xs",
          a.avecDejeuner
            ? "border-foreground bg-foreground text-background hover:bg-foreground"
            : "border-border bg-transparent text-muted-foreground hover:bg-muted"
        )}
        title={
          a.avecDejeuner
            ? "Petit-déjeuner + déjeuner (200 MAD/jour) — cliquer pour repasser à petit-déjeuner seul"
            : "Petit-déjeuner seul (100 MAD/jour) — cliquer pour ajouter le déjeuner (200 MAD/jour)"
        }
      >
        {a.avecDejeuner ? <UtensilsCrossed className="h-3 w-3" /> : <Coffee className="h-3 w-3" />}
        {a.avecDejeuner ? "+ Déjeuner" : "PDJ seul"}
      </button>
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled || paye}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Retirer ${a.nom}`}
        title={paye ? "Déjà payée — impossible à retirer" : "Retirer"}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
