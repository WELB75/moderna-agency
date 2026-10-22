import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { PrintButton } from "@/components/app/print-button";
import { SyndicLogementForm } from "@/components/app/syndic-logement-form";
import { DECLARANT_SYNDIC, getDeclarationSyndic } from "@/lib/syndic";
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
  // Au moins six lignes, comme sur le modèle papier, pour pouvoir compléter à la main au besoin.
  const lignes = Math.max(6, d.personnes.length);

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
        />
      </div>

      {/* Le document lui-même : à l'écran dans un cadre blanc (aperçu), seul élément imprimé. */}
      <div
        className={cn(
          "rounded-xl border bg-white p-6 text-black shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none",
          !prete && "opacity-60 print:opacity-100"
        )}
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        <div className="space-y-1 text-center text-base font-bold uppercase underline sm:text-lg">
          <p>Syndicat des copropriétaires</p>
          <p>{d.syndic?.entete ?? "…………………………………………"}</p>
        </div>

        <p className="mt-10 text-center text-base font-bold uppercase underline sm:text-lg">Déclaration sur l&apos;honneur</p>

        <div className="mt-10 space-y-4 text-[15px] leading-relaxed">
          <p>
            Je soussigné Copropriétaire M./Mme/Mlle : <span className="font-semibold">{DECLARANT_SYNDIC.nom}</span>
          </p>
          <p>
            N° CIN ou PPORT : <span className="font-semibold">{DECLARANT_SYNDIC.piece}</span>
            <span className="ml-10">Délivré à : {DECLARANT_SYNDIC.delivreA || "………………"}</span>
          </p>
          <p>Déclare sur l&apos;honneur que les personnes ci-après :</p>

          <ul className="space-y-3 pl-6">
            {Array.from({ length: lignes }, (_, i) => d.personnes[i] ?? null).map((p, i) => (
              <li key={p?.id ?? `vide-${i}`} className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-2 shrink-0">▪</span>
                <span className="min-w-[16rem] flex-1 border-b border-dotted border-black/60 pb-0.5">
                  {p ? p.nom : " "}
                </span>
                <span className="shrink-0">N° CIN/PP :</span>
                <span className="w-44 border-b border-dotted border-black/60 pb-0.5">
                  {p ? p.piece || (p.enfant ? "mineur" : " ") : " "}
                </span>
              </li>
            ))}
          </ul>

          <p className="pt-4">
            Sont destinés à loger dans mon appartement : N°
            <span className="mx-1 inline-block min-w-12 border-b border-dotted border-black/60 text-center font-semibold">
              {d.numeroAppartement ?? " "}
            </span>
            Immeuble N°
            <span className="mx-1 inline-block min-w-12 border-b border-dotted border-black/60 text-center font-semibold">
              {d.numeroImmeuble ?? " "}
            </span>
          </p>
          <p>
            Située à la résidence <span className="font-semibold">{d.syndic?.residence ?? "………………"}</span> Durant la période :
          </p>
          <p>
            DU <span className="mx-1 font-semibold underline">{d.du}</span>
            <span className="mx-6">Au</span>
            <span className="font-semibold underline">{d.au}</span>.
          </p>

          <p className="pt-2 indent-8">
            Je désengage le syndic de toute responsabilité en cas de litige entre le propriétaire et le locataire ou
            invité. Ces derniers sont tenus de respecter le règlement interne de la copropriété affiché à
            l&apos;entrée de l&apos;immeuble.
          </p>

          <p className="pt-8 text-right">
            Fait à Marrakech, le <span className="font-semibold">{d.faitLe}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
