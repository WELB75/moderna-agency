import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getDb } from "@/db";
import { interventions, villas, domaines } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { InterventionValidation } from "@/components/app/intervention-validation";
import { Badge } from "@/components/ui/badge";
import { INTERVENTION_STEPS, INTERVENTION_STEP_TIMESTAMP_KEYS } from "@/lib/intervention-steps";
import { cn } from "@/lib/utils";

export default async function PublicInterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [intervention] = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      lieu: interventions.lieu,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      prestataire: interventions.prestataire,
      etape: interventions.etape,
      notes: interventions.notes,
      attachmentUrls: interventions.attachmentUrls,
      signaleAt: interventions.signaleAt,
      contacteAt: interventions.contacteAt,
      planifieAt: interventions.planifieAt,
      debutAt: interventions.debutAt,
      finAt: interventions.finAt,
      validationStatut: interventions.validationStatut,
      validationNote: interventions.validationNote,
      validationAt: interventions.validationAt,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .where(eq(interventions.id, id))
    .limit(1);

  if (!intervention) notFound();

  const currentIndex = INTERVENTION_STEPS.findIndex((s) => s.key === intervention.etape);
  const pct = ((currentIndex + 1) / INTERVENTION_STEPS.length) * 100;

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      <div className="rounded-lg border p-4 sm:p-6">
        <h1 className="break-words text-xl font-bold uppercase tracking-wide sm:text-2xl">
          {intervention.titre}
        </h1>

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
        <p className="mt-1 text-sm text-muted-foreground">
          {intervention.villaNom
            ? `${intervention.villaNom} (n°${intervention.villaNumero})`
            : intervention.lieu ?? "Lieu non renseigné"}
          {intervention.prestataire ? ` · ${intervention.prestataire}` : ""}
        </p>

        {intervention.probleme ? <p className="mt-3 text-sm">{intervention.probleme}</p> : null}

        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-5">
            {INTERVENTION_STEPS.map((s, i) => {
              const ts = intervention[INTERVENTION_STEP_TIMESTAMP_KEYS[s.key]] as Date | null;
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
                      {format(new Date(ts), "d/MM HH:mm")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {intervention.notes ? (
          <div className="mt-4 whitespace-pre-line rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {intervention.notes}
          </div>
        ) : null}

        <div className="mt-4">
          <InterventionAttachments urls={intervention.attachmentUrls ?? []} />
        </div>

        <div className="mt-4">
          <InterventionValidation
            interventionId={intervention.id}
            validationStatut={intervention.validationStatut}
            validationNote={intervention.validationNote}
            validationAt={intervention.validationAt}
          />
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Lien de consultation Moderna Agency
      </p>
    </div>
  );
}
