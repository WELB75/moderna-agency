"use client";

import { useOptimistic, useState, useTransition } from "react";
import { X, Check, Circle, Coffee, UtensilsCrossed, Star, MessageCircle, StickyNote, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toWhatsAppUrl } from "@/lib/phone";
import {
  addPersonnelAffectation,
  removePersonnelAffectation,
  toggleAffectationFait,
  updateAffectationJours,
  updateAffectationAvecDejeuner,
  updateAffectationCommentaire,
  markAffectationPaidSolo,
  unmarkAffectationPaid,
  setAffectationQualiteNote,
  sendBrahimCoursesReminder,
} from "@/lib/actions/personnel";
import {
  TARIF_CUISINE_PETIT_DEJEUNER,
  TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER,
  estPayeParProprietaire,
  tarifMenageJournalier,
  type VillaTarifContext,
} from "@/lib/personnel-tarifs";
import type { PersonnelOption } from "@/lib/personnel-options";

export type PersonnelAssigne = {
  affectationId: string;
  personnelId: string;
  nom: string;
  telephone: string | null;
  faitAt: Date | null;
  nbJours: number | null;
  avecDejeuner: boolean;
  payeAt: Date | null;
  commentaire: string | null;
  qualiteNote: number | null;
};

type OptimisticAction =
  | { type: "add"; personnelId: string; nom: string }
  | { type: "remove"; affectationId: string }
  | { type: "toggleFait"; affectationId: string; fait: boolean }
  | { type: "setJours"; affectationId: string; nbJours: number | null }
  | { type: "toggleAvecDejeuner"; affectationId: string; avecDejeuner: boolean }
  | { type: "setPaid"; affectationId: string; paye: boolean }
  | { type: "setCommentaire"; affectationId: string; commentaire: string | null }
  | { type: "setQualiteNote"; affectationId: string; qualiteNote: number | null };

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
  onAssignedChange,
  minimal = false,
  villaTarifContext = null,
}: {
  reservationId: string;
  role: "menage" | "cuisine";
  label: string;
  assigned: PersonnelAssigne[];
  options: PersonnelOption[];
  // Pour l'aperçu du tarif ménage affiché avant confirmation : Noria (100/150 MAD selon le
  // nombre de chambres) a un tarif différent des villas (200 MAD/jour) — voir
  // personnel-tarifs.ts. Omis (villa hors Noria ou contexte non transmis), retombe sur le tarif
  // villa standard, comme avant.
  villaTarifContext?: VillaTarifContext | null;
  // Noms des personnes dont le ménage/cuisine est payé directement par le propriétaire pour
  // cette villa : aucun montant ni bouton de paiement ne doit apparaître pour elles côté
  // agence. Les autres personnes affectées à la même réservation restent payées normalement.
  payeParProprietaireNoms?: string[];
  // Ménage uniquement : "sejour" (pendant le séjour, à la demande du client) vs "depart" (ménage
  // de fin de séjour, souvent une équipe différente) — la MÊME personne peut être affectée aux
  // deux pour la même réservation. "unique" (défaut) pour la cuisine, sans objet.
  moment?: "sejour" | "depart" | "unique";
  // Optionnel : miroir de l'état optimiste vers le parent — nécessaire quand `assigned` ne vient
  // pas d'un rendu serveur revalidé (ex. assistant de création de réservation, où la fiche
  // n'existe pas encore côté page) : sans lui, l'ajout retombe à la liste vide dès que l'action
  // serveur se termine, puisque le seul état "réel" que ce composant connaît est le prop figé
  // passé par le parent. Kamel, 2026-09-15 : "QUAND JE VEUX AJOUTE FEMME DE MENAGE ET CUISINIERE
  // CA MARCHE PAS" — l'affectation était bien créée en base, seul l'affichage ne suivait pas.
  onAssignedChange?: (next: PersonnelAssigne[]) => void;
  // Juste le nom + un retrait, sans tarif ni "confirmé fait"/noter/commentaire — Kamel,
  // 2026-09-15 : "ici je veux juste leur nom", pour l'étape Personnel de l'assistant de
  // réservation où rien de tout ça n'a de sens avant même le séjour. Sans effet sur les usages
  // existants (fiche réservation), où minimal reste absent (donc false).
  minimal?: boolean;
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
            telephone: null,
            faitAt: null,
            nbJours: null,
            avecDejeuner: false,
            payeAt: null,
            commentaire: null,
            qualiteNote: null,
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
      case "setPaid":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, payeAt: action.paye ? new Date() : null } : a));
      case "setCommentaire":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, commentaire: action.commentaire } : a));
      case "setQualiteNote":
        return state.map((a) => (a.affectationId === action.affectationId ? { ...a, qualiteNote: action.qualiteNote } : a));
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
        const result = await addPersonnelAffectation(reservationId, personnelId, moment);
        // Miroir vers le parent avec le vrai id (jamais l'id optimiste temporaire) — seulement
        // une fois l'action résolue : le faire pendant que l'action est encore en cours ferait
        // rejouer "add" par-dessus un nouveau `assigned` qui la contient déjà, dupliquant l'entrée
        // (clé React en double). Nécessaire uniquement quand `assigned` ne vient pas d'un rendu
        // serveur revalidé (ex. assistant de création de réservation) — voir onAssignedChange.
        if (result.id) {
          onAssignedChange?.([
            ...assigned,
            {
              affectationId: result.id,
              personnelId,
              nom: option.nom,
              telephone: null,
              faitAt: null,
              nbJours: null,
              avecDejeuner: false,
              payeAt: null,
              commentaire: null,
              qualiteNote: null,
            },
          ]);
        }
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
        onAssignedChange?.(assigned.filter((a) => a.affectationId !== affectationId));
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

  // Bascule ON/OFF plutôt qu'une action à sens unique : Kamel, 2026-08-06 : "réactivé tout le
  // bloc, faire un ON OFF quoi, désactiver l'opacité" — repasser en non-payée réactive aussi les
  // autres champs (jours, déjeuner, retrait), plus verrouillés par le statut payée.
  function handleTogglePaid(affectationId: string, paye: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "setPaid", affectationId, paye: !paye });
      try {
        const result = paye ? await unmarkAffectationPaid(affectationId) : await markAffectationPaidSolo(affectationId);
        if (result.ok) {
          toast.success(paye ? "Paiement annulé, dépense retirée de la caisse." : "Marquée payée et ajoutée à la caisse.");
        } else {
          toast.error(result.message ?? "Erreur.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleSetCommentaire(affectationId: string, commentaire: string | null) {
    startTransition(async () => {
      applyOptimistic({ type: "setCommentaire", affectationId, commentaire });
      try {
        await updateAffectationCommentaire(affectationId, commentaire);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  // Note qualité (1-5) sur le travail réellement constaté — distincte de la note client (voir
  // StayRatingButton). Ménage : uniquement pour le ménage de départ (propreté vérifiée avant
  // l'arrivée suivante) ; cuisine : sur chaque mission.
  function handleSetQualiteNote(affectationId: string, qualiteNote: number | null) {
    startTransition(async () => {
      applyOptimistic({ type: "setQualiteNote", affectationId, qualiteNote });
      try {
        await setAffectationQualiteNote(affectationId, qualiteNote);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  // Bouton "Prévenir Brahim" — en plus du cron quotidien (voir brahim.ts), pour renvoyer à la
  // demande (ex. Brahim n'a rien reçu) ou un cas particulier. Pas d'état optimiste ici : ça
  // n'affecte pas l'affectation elle-même, juste un envoi WhatsApp.
  const [isNotifyingBrahim, setIsNotifyingBrahim] = useState(false);
  function handleNotifyBrahim() {
    setIsNotifyingBrahim(true);
    startTransition(async () => {
      try {
        const result = await sendBrahimCoursesReminder(reservationId);
        if (result.sent) {
          toast.success(`Brahim prévenu pour ${result.villa}.`);
        } else {
          toast.error("Réservation introuvable ou annulée.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      } finally {
        setIsNotifyingBrahim(false);
      }
    });
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {/* Une ligne par personne (plus le "+ Ajouter" sur sa propre ligne) plutôt qu'un flex-wrap
          horizontal : avec plusieurs personnes affectées, les badges (largeur variable selon
          leur contenu) tombaient n'importe où sur 2 lignes inégales, et "+ Ajouter" se retrouvait
          collé au dernier badge au lieu d'être aligné proprement. Kamel, 2026-08-17 : "c pas
          propre du tout... faut que tout soit propre symetrique bien proportionné". */}
      <div className="flex flex-col items-start gap-1.5">
        {optimisticAssigned.map((a) =>
          minimal ? (
            <div
              key={a.affectationId}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background py-1 pl-2.5 pr-1.5 text-sm"
            >
              <span className="truncate">{a.nom}</span>
              <button
                type="button"
                onClick={() => handleRemove(a.affectationId)}
                disabled={isPending}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                title="Retirer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : role === "menage" ? (
            <MenageBadge
              key={a.affectationId}
              a={a}
              disabled={isPending}
              notable={moment === "depart"}
              onToggleFait={handleToggleFait}
              onRemove={handleRemove}
              onSetJours={handleSetJours}
              onSetCommentaire={handleSetCommentaire}
              onSetQualiteNote={handleSetQualiteNote}
              montantVisible={!estPayeParProprietaire(payeParProprietaireNoms, a.nom)}
              tarifJournalier={tarifMenageJournalier(villaTarifContext)}
            />
          ) : (
            <CuisineBadge
              key={a.affectationId}
              a={a}
              disabled={isPending}
              onRemove={handleRemove}
              onSetJours={handleSetJours}
              onToggleAvecDejeuner={handleToggleAvecDejeuner}
              onTogglePaid={handleTogglePaid}
              onSetCommentaire={handleSetCommentaire}
              onSetQualiteNote={handleSetQualiteNote}
              montantVisible={!estPayeParProprietaire(payeParProprietaireNoms, a.nom)}
            />
          )
        )}
        {!minimal && role === "menage" && moment === "depart" && optimisticAssigned.length > 0 ? (
          <button
            type="button"
            onClick={handleNotifyBrahim}
            disabled={isNotifyingBrahim}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            title="Envoyer un rappel de courses à Brahim pour ce départ"
          >
            <ShoppingBasket className="h-3.5 w-3.5" />
            {isNotifyingBrahim ? "Envoi…" : "Prévenir Brahim"}
          </button>
        ) : null}
        {availableOptions.length > 0 ? (
          <Select value="" onValueChange={handleAdd} disabled={isPending}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="+ Ajouter" />
            </SelectTrigger>
            {/* Distance au domaine (à vol d'oiseau depuis la dernière position WhatsApp connue),
                note qualité moyenne (voir QualiteNoteControl) et notes libres affichées sous le
                nom : aide à repérer la personne la plus proche / la mieux notée plutôt que de
                choisir à l'aveugle dans une liste alphabétique. Le km est aligné à droite (colonne
                fixe) plutôt que collé au nom : sinon sa position horizontale saute d'une ligne à
                l'autre selon la longueur du nom. Kamel, 2026-09-04 : "je veux pas de decalage que
                ce soit en mobile ou version pc" puis "je vois pas la note sur 5" — chaque ligne
                supplémentaire (note, remarque) démarre systématiquement à gauche, sous le nom.
                Les options restent triées par proximité (voir buildPersonnelOptions), pas
                re-triées ici. */}
            <SelectContent className="w-72 max-w-72">
              {availableOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="flex w-full min-w-0 flex-col gap-0.5 py-0.5 leading-tight">
                    <span className="flex w-full items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{o.nom}</span>
                      {o.distanceKm != null ? (
                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                          {o.distanceKm.toFixed(1)} km
                        </span>
                      ) : null}
                    </span>
                    {o.qualiteMoyenne != null ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 shrink-0 fill-current" />
                        <span className="tabular-nums">{o.qualiteMoyenne.toFixed(1)}/5</span>
                        <span className="text-muted-foreground/70">({o.qualiteTotal})</span>
                      </span>
                    ) : null}
                    {o.notes ? <span className="truncate text-xs text-muted-foreground">{o.notes}</span> : null}
                  </span>
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

// Note qualité (1-5, étoiles) sur le travail réellement constaté d'une affectation — compact,
// à côté du reste du badge. Distinct de StayRatingButton (note client) : celle-ci note la
// personne, pas le client, et vit par affectation pour pouvoir moyenner sur le long terme
// (RosterSection, personnel/page.tsx). Kamel, 2026-08-09.
function QualiteNoteControl({
  qualiteNote,
  disabled,
  onSetQualiteNote,
  title,
}: {
  qualiteNote: number | null;
  disabled: boolean;
  onSetQualiteNote: (note: number | null) => void;
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={title}
          className={cn(
            "flex items-center gap-0.5 border px-1.5 py-0.5 text-xs",
            qualiteNote
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <Star className="h-3 w-3" />
          {qualiteNote ? `${qualiteNote}/5` : "Noter"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {[5, 4, 3, 2, 1].map((n) => (
          <DropdownMenuItem key={n} onClick={() => onSetQualiteNote(n)}>
            {n}/5
          </DropdownMenuItem>
        ))}
        {qualiteNote ? (
          <DropdownMenuItem onClick={() => onSetQualiteNote(null)} className="text-muted-foreground">
            Retirer la note
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Version compacte de la remarque libre (vs. Input toujours affiché) : un simple bouton-icône
// qui ouvre un petit popover avec la zone de texte, pour que la ligne entière (nom, montant,
// note qualité, remarque) tienne sur une seule ligne même sur mobile étroit — Kamel, 2026-08-16 :
// "rend ça plus minimaliste que ça tienne sur une ligne".
function CommentaireControl({
  commentaire,
  disabled,
  onSave,
  title,
}: {
  commentaire: string | null;
  disabled: boolean;
  onSave: (commentaire: string | null) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(commentaire ?? "");

  function handleOpenChange(next: boolean) {
    if (next) setValue(commentaire ?? "");
    setOpen(next);
  }

  function handleSave() {
    const trimmed = value.trim();
    if (trimmed !== (commentaire ?? "")) onSave(trimmed || null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={title}
          className={cn(
            "flex items-center gap-1 border px-1.5 py-0.5 text-xs",
            commentaire
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <StickyNote className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Remarque libre sur cette affectation"
          rows={3}
          autoFocus
        />
        <Button type="button" size="sm" className="w-full" onClick={handleSave}>
          Enregistrer
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// Remarque toujours visible (comportement d'origine, conservé pour le ménage "pendant le
// séjour" — la ligne a plus de place vu qu'elle garde aussi le champ jours).
function CommentaireInput({
  commentaire,
  disabled,
  onSave,
}: {
  commentaire: string | null;
  disabled: boolean;
  onSave: (commentaire: string | null) => void;
}) {
  const [value, setValue] = useState(commentaire ?? "");

  function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === (commentaire ?? "")) return;
    onSave(trimmed || null);
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder="note"
      title="Remarque libre sur cette affectation"
      className="h-5 w-20 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-1"
    />
  );
}

// Contact WhatsApp direct depuis le badge — Kamel, 2026-08-13 : "donne la possibilité aussi ici
// de les contacter en un clic whatsapp", pour joindre la personne affectée sans devoir aller
// chercher son numéro sur la page Personnel.
function WhatsAppContactButton({ telephone, nom }: { telephone: string; nom: string }) {
  return (
    <a
      href={toWhatsAppUrl(telephone)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="rounded-full p-1 text-emerald-600 hover:bg-muted dark:text-emerald-400"
      aria-label={`Contacter ${nom} sur WhatsApp`}
      title={`Contacter ${nom} sur WhatsApp`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
    </a>
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
  notable,
  onToggleFait,
  onRemove,
  onSetJours,
  onSetCommentaire,
  onSetQualiteNote,
  montantVisible,
  tarifJournalier,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  // Note qualité réservée au ménage de départ (moment "depart") : c'est le seul moment où l'état
  // de propreté est vraiment vérifié, avant l'arrivée suivante.
  notable: boolean;
  onToggleFait: (affectationId: string, fait: boolean) => void;
  onRemove: (affectationId: string) => void;
  onSetJours: (affectationId: string, nbJours: number | null) => void;
  onSetCommentaire: (affectationId: string, commentaire: string | null) => void;
  onSetQualiteNote: (affectationId: string, qualiteNote: number | null) => void;
  montantVisible: boolean;
  tarifJournalier: number;
}) {
  const fait = Boolean(a.faitAt);
  const [jours, setJours] = useState(a.nbJours != null ? String(a.nbJours) : "");

  function handleBlur() {
    const parsed = jours.trim() === "" ? null : Math.max(1, parseInt(jours, 10));
    if (parsed === a.nbJours || (parsed === null && a.nbJours === null)) return;
    onSetJours(a.affectationId, Number.isNaN(parsed as number) ? null : parsed);
  }

  function handleSaveCommentaire(commentaire: string | null) {
    onSetCommentaire(a.affectationId, commentaire);
  }

  // Le ménage de départ est toujours 1 jour de travail (contrairement au ménage sollicité
  // pendant le séjour, qui peut s'étaler) : pas de champ à saisir, juste le tarif fixe — Kamel,
  // 2026-08-16 : "un ménage de départ c'est toujours un jour donc on peut supprimer".
  const joursApercu = jours.trim() === "" ? 1 : Math.max(1, parseInt(jours, 10) || 1);
  const montantApercu = notable ? tarifJournalier : joursApercu * tarifJournalier;

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-background py-0.5 pl-0.5 pr-2.5 text-[0.8rem] font-medium">
      <Button
        type="button"
        variant={fait ? "default" : "outline"}
        size="sm"
        onClick={() => onToggleFait(a.affectationId, !fait)}
        disabled={disabled}
        // Largeur FIXE (pas juste min-w) + nom tronqué : un min-w seul laisse un nom long
        // (ex. "Khamissa") pousser le bouton plus large que "Nawal", donc "200 MAD" ne
        // s'alignait toujours pas d'une ligne à l'autre. Kamel, 2026-08-17 : "je vois toujours
        // le decalage... les 200 doivent etre bien alignée aussi, paralelle etc".
        className="h-6 w-28 shrink-0 justify-start overflow-hidden"
        title={fait ? "Confirmé fait — cliquer pour annuler" : "Cliquer pour confirmer que le travail a été fait"}
      >
        {fait ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{a.nom}</span>
      </Button>
      {notable ? null : (
        <>
          <Input
            type="number"
            min={1}
            value={jours}
            onChange={(e) => setJours(e.target.value)}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder="1"
            title="Nombre de jours travaillés (si sollicitée pendant le séjour, pas seulement au départ)"
            className="h-5 w-7 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
          />
          <span className="text-muted-foreground">{joursApercu > 1 ? "jours" : "jour"}</span>
        </>
      )}
      {montantVisible ? (
        <span className="text-muted-foreground">{notable ? "" : "· "}{montantApercu} MAD</span>
      ) : (
        <span className="text-muted-foreground" title="Payé directement par le propriétaire, pas par l'agence">
          {notable ? "" : "· "}Payé par proprio
        </span>
      )}
      {notable ? (
        <QualiteNoteControl
          qualiteNote={a.qualiteNote}
          disabled={disabled}
          onSetQualiteNote={(note) => onSetQualiteNote(a.affectationId, note)}
          title="Note qualité sur la propreté constatée (moyenne affichée sur la fiche de la personne)"
        />
      ) : null}
      {notable ? (
        <CommentaireControl
          commentaire={a.commentaire}
          disabled={disabled}
          onSave={handleSaveCommentaire}
          title="Remarque libre sur cette affectation"
        />
      ) : (
        <CommentaireInput commentaire={a.commentaire} disabled={disabled} onSave={handleSaveCommentaire} />
      )}
      {a.telephone ? <WhatsAppContactButton telephone={a.telephone} nom={a.nom} /> : null}
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
  onTogglePaid,
  onSetCommentaire,
  onSetQualiteNote,
  montantVisible,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  onRemove: (affectationId: string) => void;
  onSetJours: (affectationId: string, nbJours: number | null) => void;
  onToggleAvecDejeuner: (affectationId: string, avecDejeuner: boolean) => void;
  onTogglePaid: (affectationId: string, paye: boolean) => void;
  onSetCommentaire: (affectationId: string, commentaire: string | null) => void;
  onSetQualiteNote: (affectationId: string, qualiteNote: number | null) => void;
  montantVisible: boolean;
}) {
  const [jours, setJours] = useState(a.nbJours != null ? String(a.nbJours) : "");
  const [commentaire, setCommentaire] = useState(a.commentaire ?? "");
  const paye = Boolean(a.payeAt);

  function handleBlur() {
    const parsed = jours.trim() === "" ? null : Math.max(1, parseInt(jours, 10));
    if (parsed === a.nbJours || (parsed === null && a.nbJours === null)) return;
    onSetJours(a.affectationId, Number.isNaN(parsed as number) ? null : parsed);
  }

  function handleCommentaireBlur() {
    const trimmed = commentaire.trim();
    if (trimmed === (a.commentaire ?? "")) return;
    onSetCommentaire(a.affectationId, trimmed || null);
  }

  // Aperçu du montant en direct (pas seulement une fois payé) : 1 jour par défaut si le nombre
  // de jours n'est pas encore précisé (séjour complet), pour toujours voir un montant concret
  // dès qu'on choisit le niveau de service. Le vrai montant (et l'éligibilité au paiement) est
  // recalculé côté serveur au clic sur "payer", pas déduit de cet aperçu.
  const joursApercu = jours.trim() === "" ? 1 : Math.max(1, parseInt(jours, 10) || 1);
  const tarifJour = a.avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER;
  const montantApercu = joursApercu * tarifJour;

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-0.5 text-[0.8rem] font-medium">
      {/* Largeur fixe (pas min-w) + troncature, même raison que MenageBadge : un min-w seul
          n'aligne pas le reste de la ligne (jours, montant...) quand un nom dépasse cette
          largeur minimale. */}
      <span className="inline-block w-24 shrink-0 truncate">{a.nom}</span>
      <Input
        type="number"
        min={1}
        value={jours}
        onChange={(e) => setJours(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="nb"
        title="Nombre de jours si ce n'est pas tout le séjour"
        className="h-5 w-8 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
      />
      <span className="text-muted-foreground">{jours === "1" ? "jour" : "jours"}</span>
      {montantVisible ? (
        <button
          type="button"
          onClick={() => onTogglePaid(a.affectationId, paye)}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 border px-1.5 py-0.5 text-xs",
            paye
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-transparent text-muted-foreground hover:bg-muted"
          )}
          title={paye ? "Payée — cliquer pour annuler (retire aussi la dépense de la caisse)" : `Cliquer pour marquer payée (${montantApercu} MAD) — ajouté directement à la caisse`}
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
        disabled={disabled}
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
      <QualiteNoteControl
        qualiteNote={a.qualiteNote}
        disabled={disabled}
        onSetQualiteNote={(note) => onSetQualiteNote(a.affectationId, note)}
        title="Note qualité sur la cuisine constatée (moyenne affichée sur la fiche de la personne)"
      />
      <Input
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        onBlur={handleCommentaireBlur}
        disabled={disabled}
        placeholder="note"
        title="Remarque libre sur cette affectation"
        className="h-5 w-20 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-1"
      />
      {a.telephone ? <WhatsAppContactButton telephone={a.telephone} nom={a.nom} /> : null}
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
