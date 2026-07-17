"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import {
  setInterventionEtape,
  updateInterventionNotes,
  addInterventionAttachments,
  deleteIntervention,
} from "@/lib/actions/interventions";
import { cn } from "@/lib/utils";

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(url);
}

type Etape = "signale" | "contacte" | "planifie" | "en_cours" | "termine";

const STEPS: { key: Etape; label: string }[] = [
  { key: "signale", label: "Signalé" },
  { key: "contacte", label: "Contacté" },
  { key: "planifie", label: "Planifié" },
  { key: "en_cours", label: "En cours" },
  { key: "termine", label: "Terminé" },
];

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
  etape: Etape;
  notes: string | null;
  attachmentUrls: string[] | null;
  signaleAt: Date;
  contacteAt: Date | null;
  planifieAt: Date | null;
  debutAt: Date | null;
  finAt: Date | null;
  createdByName: string | null;
};

const TIMESTAMPS: Record<Etape, keyof Intervention> = {
  signale: "signaleAt",
  contacte: "contacteAt",
  planifie: "planifieAt",
  en_cours: "debutAt",
  termine: "finAt",
};

export function InterventionCard({ intervention }: { intervention: Intervention }) {
  const [notes, setNotes] = useState(intervention.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {intervention.domaineNom ? <DomaineBadge nom={intervention.domaineNom} className="text-xs" /> : null}
              {intervention.domaineId ? (
                <DomaineLocation domaineId={intervention.domaineId} mapsUrl={intervention.domaineMapsUrl} />
              ) : null}
              <p className="font-medium">{intervention.titre}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {intervention.villaNom
                ? `${intervention.villaNom} (n°${intervention.villaNumero})`
                : intervention.lieu ?? "Lieu non renseigné"}
              {intervention.prestataire ? ` · ${intervention.prestataire}` : ""}
            </p>
          </div>
          <ConfirmDeleteButton
            action={deleteIntervention.bind(null, intervention.id)}
            title="Supprimer cette intervention ?"
            description="Cette action est irréversible."
          />
        </div>

        {intervention.probleme ? <p className="text-sm">{intervention.probleme}</p> : null}

        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {STEPS.map((s, i) => {
              const ts = intervention[TIMESTAMPS[s.key]] as Date | null;
              return (
                <div key={s.key} className="min-w-0 text-center">
                  <p
                    className={cn(
                      "truncate text-[10px]",
                      i <= currentIndex ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </p>
                  {ts ? (
                    <p className="truncate text-[9px] text-muted-foreground">
                      {format(new Date(ts), "d MMM HH:mm", { locale: fr })}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={intervention.etape} onValueChange={handleEtapeChange} disabled={isPending}>
            <SelectTrigger className="h-8 w-auto text-xs">
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
          {intervention.etape === "termine" ? (
            <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              Terminé
            </Badge>
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

        {intervention.attachmentUrls && intervention.attachmentUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {intervention.attachmentUrls.map((url) =>
              isVideoUrl(url) ? (
                <video key={url} src={url} controls className="h-28 w-full rounded-md border object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-28 w-full rounded-md border object-cover" />
              )
            )}
          </div>
        ) : null}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            Ajouter photo / vidéo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
