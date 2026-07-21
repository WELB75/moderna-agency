import { DomaineBadge } from "@/components/app/domaine-badge";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { InterventionValidation } from "@/components/app/intervention-validation";
import { InterventionComments, type CommentRow } from "@/components/app/intervention-comments";
import { DevisDocument } from "@/components/app/devis-document";
import { PrintButton } from "@/components/app/print-button";
import { LinkifiedText } from "@/components/app/linkified-text";
import { Badge } from "@/components/ui/badge";
import { INTERVENTION_STEPS, INTERVENTION_STEP_TIMESTAMP_KEYS, type Etape } from "@/lib/intervention-steps";
import { cn } from "@/lib/utils";
import { formatUtcDayMonthTime } from "@/lib/now";
import type { Devis } from "@/lib/devis-types";

export type InterventionPublicData = {
  id: string;
  titre: string;
  probleme: string | null;
  lieu: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  prestataire: string | null;
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

export function InterventionPublicCard({
  intervention,
  showVillaInfo = true,
  comments,
  commentAuteur,
  commentAuteurType,
}: {
  intervention: InterventionPublicData;
  showVillaInfo?: boolean;
  comments?: CommentRow[];
  commentAuteur?: string;
  commentAuteurType?: "staff" | "proprietaire";
}) {
  const currentIndex = INTERVENTION_STEPS.findIndex((s) => s.key === intervention.etape);
  const pct = ((currentIndex + 1) / INTERVENTION_STEPS.length) * 100;

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h3 className="break-words text-xl font-bold uppercase tracking-wide sm:text-2xl">
        {intervention.titre}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {intervention.domaineNom ? <DomaineBadge nom={intervention.domaineNom} className="text-xs" /> : null}
        {intervention.etape === "termine" ? (
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

      {intervention.notes ? (
        <div className="mt-4 whitespace-pre-line rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <LinkifiedText text={intervention.notes} />
        </div>
      ) : null}

      <div className="mt-4">
        <InterventionAttachments urls={intervention.attachmentUrls ?? []} />
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

      <div className="mt-4">
        <InterventionValidation
          interventionId={intervention.id}
          validationStatut={intervention.validationStatut}
          validationNote={intervention.validationNote}
          validationAt={intervention.validationAt}
        />
      </div>

      {comments && commentAuteur && commentAuteurType ? (
        <div className="mt-4">
          <InterventionComments
            interventionId={intervention.id}
            comments={comments}
            auteur={commentAuteur}
            auteurType={commentAuteurType}
          />
        </div>
      ) : null}
    </div>
  );
}
