import { differenceInCalendarDays } from "date-fns";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { InterventionValidation } from "@/components/app/intervention-validation";
import { InterventionComments, type CommentRow } from "@/components/app/intervention-comments";
import { DevisDocument } from "@/components/app/devis-document";
import { PrintButton } from "@/components/app/print-button";
import { LinkifiedText } from "@/components/app/linkified-text";
import { UrgenceBadge } from "@/components/app/urgence-badge";
import { InterventionStatusControls } from "@/components/app/intervention-status-controls";
import { Badge } from "@/components/ui/badge";
import { INTERVENTION_STEPS, INTERVENTION_STEP_TIMESTAMP_KEYS, type Etape } from "@/lib/intervention-steps";
import { cn } from "@/lib/utils";
import { formatUtcDayMonthTime } from "@/lib/now";
import type { Devis } from "@/lib/devis-types";
import type { Urgence } from "@/lib/intervention-urgence";

export type InterventionPublicData = {
  id: string;
  titre: string;
  probleme: string | null;
  lieu: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  prestataire: string | null;
  urgence: Urgence;
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
};

const STATUT_BADGE_CLASS: Record<Etape, string> = {
  signale: "border-muted-foreground/30 bg-muted text-muted-foreground",
  contacte: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  planifie: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  en_cours: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  termine: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const OWNER_PHOTO_LIMIT = 4;

export function InterventionPublicCard({
  intervention,
  showVillaInfo = true,
  comments,
  commentAuteur,
  commentAuteurType,
  commentAuthorOptions,
  compact = false,
  validationTitle,
}: {
  intervention: InterventionPublicData;
  showVillaInfo?: boolean;
  comments?: CommentRow[];
  commentAuteur?: string;
  commentAuteurType?: "staff" | "proprietaire";
  commentAuthorOptions?: string[];
  // Vue allégée pour le propriétaire : un seul badge de statut au lieu du détail
  // étape par étape, et un nombre de photos limité pour ne pas surcharger la page.
  compact?: boolean;
  validationTitle?: string;
}) {
  const currentIndex = INTERVENTION_STEPS.findIndex((s) => s.key === intervention.etape);
  const pct = ((currentIndex + 1) / INTERVENTION_STEPS.length) * 100;
  const joursDepuisSignalement = differenceInCalendarDays(new Date(), new Date(intervention.signaleAt));
  const stagne = intervention.etape !== "termine" && joursDepuisSignalement >= 3;
  const allAttachments = intervention.attachmentUrls ?? [];
  const shownAttachments = compact ? allAttachments.slice(0, OWNER_PHOTO_LIMIT) : allAttachments;
  const hiddenCount = allAttachments.length - shownAttachments.length;

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h3 className="break-words text-xl font-bold uppercase tracking-wide sm:text-2xl">
        {intervention.titre}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <UrgenceBadge urgence={intervention.urgence} />
        {intervention.domaineNom ? <DomaineBadge nom={intervention.domaineNom} className="text-xs" /> : null}
        {stagne ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Signalé depuis {joursDepuisSignalement} jours
          </Badge>
        ) : null}
        {!compact && intervention.etape === "termine" ? (
          <Badge
            variant="outline"
            className="border-emerald-500/50 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400"
          >
            Terminé
          </Badge>
        ) : null}
      </div>
      {showVillaInfo || intervention.prestataire ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {showVillaInfo
            ? intervention.villaNom
              ? `${intervention.villaNom} (n°${intervention.villaNumero})`
              : (intervention.lieu ?? "Lieu non renseigné")
            : null}
          {showVillaInfo && intervention.prestataire ? " · " : ""}
          {intervention.prestataire ?? ""}
        </p>
      ) : null}

      {intervention.probleme ? <p className="mt-3 text-sm">{intervention.probleme}</p> : null}

      {compact ? (
        <div className="mt-4">
          <Badge variant="outline" className={cn("text-xs", STATUT_BADGE_CLASS[intervention.etape])}>
            {INTERVENTION_STEPS[currentIndex]?.label ?? intervention.etape}
          </Badge>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-5">
            {INTERVENTION_STEPS.map((s, i) => {
              const ts = intervention[INTERVENTION_STEP_TIMESTAMP_KEYS[s.key]];
              return (
                <div
                  key={s.key}
                  className={cn(
                    "min-w-0 px-0.5 text-center",
                    i === 0 && "text-left",
                    i === INTERVENTION_STEPS.length - 1 && "text-right"
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
                      {formatUtcDayMonthTime(ts)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <InterventionStatusControls interventionId={intervention.id} etape={intervention.etape} urgence={intervention.urgence} />
      </div>

      {intervention.notes ? (
        <div className="mt-4 whitespace-pre-line rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <LinkifiedText text={intervention.notes} />
        </div>
      ) : null}

      <div className="mt-4">
        <InterventionAttachments urls={shownAttachments} />
        {hiddenCount > 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">+{hiddenCount} autre{hiddenCount > 1 ? "s" : ""} photo{hiddenCount > 1 ? "s" : ""}</p>
        ) : null}
      </div>

      {(intervention.devis ?? []).length > 0 ? (
        <div className="mt-4 space-y-3">
          {(intervention.devis ?? []).map((d, i) => (
            <div key={i} className="space-y-1.5">
              <DevisDocument devis={d} />
              <div className="flex justify-end print:hidden">
                <PrintButton />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {(intervention.devis ?? []).length > 0 ? (
        <div className="mt-4">
          <InterventionValidation
            interventionId={intervention.id}
            validationStatut={intervention.validationStatut}
            validationNote={intervention.validationNote}
            validationAt={intervention.validationAt}
            title={validationTitle}
          />
        </div>
      ) : null}

      {comments && commentAuteur && commentAuteurType ? (
        <div className="mt-4">
          <InterventionComments
            interventionId={intervention.id}
            comments={comments}
            auteur={commentAuteur}
            auteurType={commentAuteurType}
            authorOptions={commentAuthorOptions}
          />
        </div>
      ) : null}
    </div>
  );
}
