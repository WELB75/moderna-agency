"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil, Paperclip, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { DomaineLocation } from "@/components/app/domaine-location";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { InterventionValidation } from "@/components/app/intervention-validation";
import { InterventionComments, type CommentRow } from "@/components/app/intervention-comments";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { AddDevisDialog } from "@/components/app/add-devis-dialog";
import { DevisDocument } from "@/components/app/devis-document";
import { PrintButton } from "@/components/app/print-button";
import {
  setInterventionEtape,
  updateInterventionNotes,
  addInterventionAttachments,
  deleteIntervention,
  deleteDevis,
  setInterventionUrgence,
  setInterventionCategorie,
  setInterventionTechnician,
} from "@/lib/actions/interventions";
import { cn } from "@/lib/utils";
import { INTERVENTION_STEPS, INTERVENTION_STEP_TIMESTAMP_KEYS, type Etape } from "@/lib/intervention-steps";
import { URGENCE_LEVELS, type Urgence } from "@/lib/intervention-urgence";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { UrgenceBadge } from "@/components/app/urgence-badge";
import { CategorieBadge } from "@/components/app/categorie-badge";
import { CategorieIcon } from "@/components/app/categorie-icon";
import type { Devis } from "@/lib/devis-types";

const STEPS = INTERVENTION_STEPS;

export type Intervention = {
  id: string;
  titre: string;
  probleme: string | null;
  lieu: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  domaineId: string | null;
  domaineNom: string | null;
  domaineMapsUrl: string | null;
  prestataire: string | null;
  technicianId: string | null;
  urgence: Urgence;
  categorie: Categorie;
  etape: Etape;
  notes: string | null;
  attachmentUrls: string[] | null;
  devis: Devis[] | null;
  signaleAt: Date;
  contacteAt: Date | null;
  planifieAt: Date | null;
  debutAt: Date | null;
  finAt: Date | null;
  validationStatut: string | null;
  validationNote: string | null;
  validationAt: Date | null;
  createdByName: string | null;
};

const TIMESTAMPS = INTERVENTION_STEP_TIMESTAMP_KEYS;

export function InterventionCard({
  intervention,
  comments = [],
  currentUserName = "Équipe",
  technicians = [],
}: {
  intervention: Intervention;
  comments?: CommentRow[];
  currentUserName?: string;
  technicians?: { id: string; nom: string; fonction: string }[];
}) {
  const [notes, setNotes] = useState(intervention.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUrgenceChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionUrgence(intervention.id, value as Urgence);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleCategorieChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionCategorie(intervention.id, value as Categorie);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleTechnicianChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionTechnician(intervention.id, value || null);
        toast.success(value ? "Technicien assigné, notifié par WhatsApp." : "Technicien retiré.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  const currentIndex = STEPS.findIndex((s) => s.key === intervention.etape);
  const pct = ((currentIndex + 1) / STEPS.length) * 100;

  function handleEtapeChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionEtape(intervention.id, value as Etape);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleSaveNotes() {
    startTransition(async () => {
      try {
        await updateInterventionNotes(intervention.id, notes);
        toast.success("Notes enregistrées.");
        setEditingNotes(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const blob = await upload(`interventions/${intervention.id}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        uploaded.push(blob.url);
      }
      await addInterventionAttachments(intervention.id, uploaded);
      toast.success("Pièce jointe ajoutée.");
    } catch {
      toast.error("Échec de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className={cn(intervention.etape === "termine" && "border-emerald-500/30")}>
      <CardContent className="space-y-4 py-4">
        {/* En-tête : le titre est l'élément principal, toujours visible en premier */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-lg font-bold uppercase tracking-wide">
            {intervention.titre}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <CopyLinkButton
              path={`/i/${intervention.id}`}
              label="Copier le lien pour partager"
              successMessage="Lien copié — transmets-le à qui tu veux."
              iconOnly
            />
            <ConfirmDeleteButton
              action={deleteIntervention.bind(null, intervention.id)}
              title="Supprimer cette intervention ?"
              description="Cette action est irréversible."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategorieBadge categorie={intervention.categorie} />
            <UrgenceBadge urgence={intervention.urgence} />
            {intervention.domaineNom ? <DomaineBadge nom={intervention.domaineNom} className="text-xs" /> : null}
            {intervention.domaineId ? (
              <DomaineLocation domaineId={intervention.domaineId} mapsUrl={intervention.domaineMapsUrl} />
            ) : null}
            {intervention.etape === "termine" ? (
              <Badge
                variant="outline"
                className="border-emerald-500/50 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400"
              >
                Terminé
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {intervention.villaNom
              ? `${intervention.villaNom} (n°${intervention.villaNumero})`
              : intervention.lieu ?? "Lieu non renseigné"}
            {intervention.prestataire ? ` · ${intervention.prestataire}` : ""}
          </p>
        </div>

        {intervention.probleme ? <p className="text-sm">{intervention.probleme}</p> : null}

        <div className="space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-5">
            {STEPS.map((s, i) => {
              const ts = intervention[TIMESTAMPS[s.key]] as Date | null;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "min-w-0 px-0.5 text-center",
                    i === 0 && "text-left",
                    i === STEPS.length - 1 && "text-right"
                  )}
                >
                  <p
                    className={cn(
                      "text-[9px] font-medium leading-tight sm:text-[11px]",
                      i <= currentIndex ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </p>
                  {ts ? (
                    <p className="text-[8px] leading-tight text-muted-foreground sm:text-[10px]">
                      {format(new Date(ts), "d/MM HH:mm")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={intervention.etape} onValueChange={handleEtapeChange} disabled={isPending}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEPS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={intervention.urgence} onValueChange={handleUrgenceChange} disabled={isPending}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCE_LEVELS.slice()
                .reverse()
                .map((u) => (
                  <SelectItem key={u.key} value={u.key}>
                    {u.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={intervention.categorie} onValueChange={handleCategorieChange} disabled={isPending}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  <span className="flex items-center gap-1.5">
                    <CategorieIcon categorie={c.key} className="h-3.5 w-3.5" />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {technicians.length > 0 ? (
            <Select
              value={intervention.technicianId ?? ""}
              onValueChange={(v) => handleTechnicianChange(v === "_none" ? "" : v)}
              disabled={isPending}
            >
              <SelectTrigger className="h-9 w-full text-sm sm:w-48">
                <SelectValue placeholder="Assigner un technicien" />
              </SelectTrigger>
              <SelectContent>
                {intervention.technicianId ? <SelectItem value="_none">Aucun (retirer)</SelectItem> : null}
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nom} ({t.fonction})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Ex. Contacté hier, devait passer hier soir, imprévu, repoussé à aujourd'hui."
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={isPending} onClick={handleSaveNotes}>
                Enregistrer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="flex w-full items-start gap-1.5 rounded-md border border-dashed p-2 text-left text-sm text-muted-foreground hover:bg-muted/50"
          >
            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {intervention.notes || "Ajouter une note (retard, imprévu, suivi...)"}
          </button>
        )}

        <InterventionAttachments urls={intervention.attachmentUrls ?? []} />

        {(intervention.devis ?? []).length > 0 ? (
          <div className="space-y-3">
            {(intervention.devis ?? []).map((d, i) => (
              <div key={i} className="space-y-1.5">
                <DevisDocument devis={d} />
                <div className="flex justify-end gap-1 print:hidden">
                  <PrintButton />
                  <ConfirmDeleteButton
                    action={deleteDevis.bind(null, intervention.id, i)}
                    title="Supprimer ce devis ?"
                    description="Cette action est irréversible."
                    label="Supprimer"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            Ajouter photo / vidéo / audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <AddDevisDialog interventionId={intervention.id} />
        </div>

        {(intervention.devis ?? []).length > 0 ? (
          <InterventionValidation
            interventionId={intervention.id}
            validationStatut={intervention.validationStatut}
            validationNote={intervention.validationNote}
            validationAt={intervention.validationAt}
            readOnly
          />
        ) : null}

        <InterventionComments
          interventionId={intervention.id}
          comments={comments}
          auteur={currentUserName}
          auteurType="staff"
        />
      </CardContent>
    </Card>
  );
}
