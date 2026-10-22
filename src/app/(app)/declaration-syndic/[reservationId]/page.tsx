import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { PrintButton } from "@/components/app/print-button";
import { SyndicLogementForm } from "@/components/app/syndic-logement-form";
import { getDeclarationSyndic } from "@/lib/syndic";
import { DeclarationSyndicDocument } from "@/components/app/declaration-syndic-document";
import { numerosPourEnvoi } from "@/lib/syndic-numeros";
import { SyndicWhatsAppButton } from "@/components/app/syndic-whatsapp-button";
import { cn } from "@/lib/utils";

// « Déclaration sur l'honneur » pour le syndic / la sécurité de la résidence, générée depuis la
// réservation d'un appartement : même mise en page que le Word qu'Imane remplissait à la main
// (2026-10-22), avec les voyageurs repris de la fiche police. Imprimable / exportable en PDF
// avec le même bouton que la fiche police.
export default async function DeclarationSyndicPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const d = await getDeclarationSyndic(reservationId);
  if (!d) notFound();

  const prete = d.fichePoliceComplete && Boolean(d.syndic);

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-0">
      <div className="space-y-3 print:hidden">
        <Link
          href={`/reservations/${d.reservationId}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la réservation
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Déclaration syndic</h1>
            <p className="text-sm text-muted-foreground">
              {d.guestName} · {d.villaNom}
              {d.numeroAppartement ? ` (n°${d.numeroAppartement})` : ""} · du {d.du} au {d.au}
            </p>
          </div>
          {prete ? <PrintButton /> : null}
        </div>

        {d.villaType !== "appartement" ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            Ce document est prévu pour les appartements en résidence (Noria) ; {d.villaNom} est une villa.
          </p>
        ) : null}

        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
            d.fichePoliceComplete
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          )}
        >
          {d.fichePoliceComplete ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="space-y-0.5">
            {d.fichePoliceComplete ? (
              <p>
                {d.personnes.filter((p) => !p.enfant).length} adulte(s) repris de la fiche police
                {d.personnes.some((p) => p.enfant) ? ` · ${d.personnes.filter((p) => p.enfant).length} enfant(s)` : ""}.
                {d.nbAdultesAttendus !== null && d.personnes.filter((p) => !p.enfant).length < d.nbAdultesAttendus
                  ? ` ${d.nbAdultesAttendus} adultes attendus : il manque des pièces d'identité, les lignes vides se complètent à la main.`
                  : ""}
              </p>
            ) : (
              <p>
                La fiche police de ce séjour n&apos;est pas encore remplie : les voyageurs et leurs numéros de pièce
                apparaîtront ici dès que le client l&apos;aura complétée (voir la puce « Fiche police » sur la
                réservation).
              </p>
            )}
          </div>
        </div>

        <SyndicLogementForm
          villaId={d.villaId}
          villaNom={d.villaNom}
          entete={d.syndic?.entete ?? null}
          residence={d.syndic?.residence ?? null}
          whatsapp={d.syndic?.whatsapp ?? null}
        />

        {prete ? (
          <SyndicWhatsAppButton
            reservationId={d.reservationId}
            numeros={numerosPourEnvoi(d.syndic?.whatsapp)}
            guestName={d.guestName}
            residence={d.syndic?.residence ?? ""}
            numeroAppartement={d.numeroAppartement}
            du={d.du}
            au={d.au}
          />
        ) : null}
      </div>

      {/* Le document lui-même : à l'écran dans un cadre blanc (aperçu), seul élément imprimé. */}
      <DeclarationSyndicDocument d={d} prete={prete} />
    </div>
  );
}
