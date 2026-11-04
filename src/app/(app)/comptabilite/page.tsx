import Link from "next/link";
import { addMonths, format, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/app/print-button";
import { Logo } from "@/components/app/logo";
import { moisHref, periodeAncre, periodeBounds } from "@/lib/caisse-periode";
import { normaliseCanal, type CanalKey } from "@/lib/canal";
import { chargerRapportCompta, type LigneRapport } from "@/lib/compta-rapport";
import { sommeDetails, totalDetail, type DetailComptable } from "@/lib/compta-detail";
import { formaterMontant } from "@/lib/compta-reservation-format";

// Espace Comptabilité de Sanaa (Kamel, 2026-11-04) : chaque mois elle redemande le détail de chaque
// séjour — prix location sans extra, frais de ménage check-out, extra cuisinière, extra ménage,
// extra pompe à chaleur — alors que tout est déjà dans l'app. Cette page les montre d'un coup, avec
// ce qui reste à compléter, et s'exporte en PDF ou Excel. Même période que la caisse (11 → 10) et
// mêmes séjours que le rapport par réservation : un séjour compte dans la période où le client part.

const BASE = "/comptabilite";
const eur = (n: number) => formaterMontant(n, "EUR");
const LIBELLE_CANAL: Record<CanalKey, string> = { airbnb: "Airbnb", booking: "Booking.com", direct: "Direct", autre: "Autre", bloque: "Blocage" };
const COLONNES: { cle: keyof Omit<DetailComptable, "source">; titre: string }[] = [
  { cle: "location", titre: "Prix location sans extra" },
  { cle: "menageCheckout", titre: "Frais de ménage check-out" },
  { cle: "cuisine", titre: "Extra cuisinière" },
  { cle: "menageExtra", titre: "Extra ménage" },
  { cle: "pompeAChaleur", titre: "Extra pompe à chaleur" },
];

export default async function ComptabilitePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois } = await searchParams;
  const ancre = periodeAncre(mois);
  const { debut, finAffichee } = periodeBounds(ancre);
  const rapport = await chargerRapportCompta(ancre);
  const lignes = rapport.lignes;
  const cle = format(ancre, "yyyy-MM");
  const total = sommeDetails(lignes.map((l) => l.detail));
  const avecAutres = total.autresExtras > 0;

  const nonDetailles = lignes.filter((l) => l.detail.source === "non_detaille" && l.detail.location > 0);
  const deduitsDesNotes = lignes.filter((l) => l.detail.source === "note");
  const sansDetailPlateforme = lignes.filter((l) => l.plateforme && !l.revenus && l.detail.source !== "lignes");
  const resteAEncaisser = lignes.filter((l) => l.ventilation.reste > 0.01);
  const aCompleter = nonDetailles.length + sansDetailPlateforme.length + resteAEncaisser.length + deduitsDesNotes.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 print:max-w-none print:space-y-4 print:p-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">
            Séjours terminés du {format(debut, "d MMM", { locale: fr })} au {format(finAffichee, "d MMM yyyy", { locale: fr })} · {lignes.length} séjour{lignes.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Période précédente">
            <Link href={moisHref(BASE, subMonths(ancre, 1))}><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Période suivante">
            <Link href={moisHref(BASE, addMonths(ancre, 1))}><ChevronRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/compta/detail-csv?mois=${cle}`}><Download className="h-4 w-4" />Excel (CSV)</a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <div className="hidden items-center justify-between print:flex">
        <Logo size={56} />
        <div className="text-right">
          <p className="text-lg font-semibold">Comptabilité · détail par séjour</p>
          <p className="text-sm text-muted-foreground">
            Séjours terminés du {format(debut, "d MMMM", { locale: fr })} au {format(finAffichee, "d MMMM yyyy", { locale: fr })}
          </p>
        </div>
      </div>

      {/* Totaux de la période */}
      <section className="space-y-2" aria-label="Totaux de la période">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
          {COLONNES.map((c) => (
            <Cartouche key={c.cle} label={c.titre} valeur={eur(total[c.cle])} />
          ))}
          <Cartouche label="Total facturé" valeur={eur(totalDetail(total))} fort />
        </dl>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3">
          <Cartouche label="Encaissé" valeur={eur(rapport.totaux.encaisse)} />
          <Cartouche label="Reste à encaisser" valeur={eur(rapport.totaux.reste)} />
          {avecAutres ? <Cartouche label="Autres extras (inclus dans le total)" valeur={eur(total.autresExtras)} /> : null}
        </dl>
      </section>

      {/* Ce qui reste à compléter : visible à l'écran seulement, pas dans le PDF. */}
      {aCompleter > 0 ? (
        <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 print:hidden" aria-label="À compléter">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            À compléter avant d&apos;envoyer le rapport · {aCompleter}
          </div>
          <Liste titre="Séjours sans détail (seul le loyer total est connu, compté en location) :" lignes={nonDetailles} />
          <Liste titre="Airbnb / Booking.com : détail de Beds24 pas encore reçu :" lignes={sansDetailPlateforme} />
          <Liste titre="Détail lu dans la note de la réservation, à vérifier (ouvre la réservation et enregistre-le pour le confirmer) :" lignes={deduitsDesNotes} />
          <Liste titre="Reste à encaisser :" lignes={resteAEncaisser} avecReste />
          <p className="text-xs text-muted-foreground">Ouvre la réservation pour renseigner le détail financier : il apparaît ici dès l&apos;enregistrement.</p>
        </section>
      ) : lignes.length > 0 ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 print:hidden dark:text-emerald-300">
          Tout est renseigné pour cette période.
        </p>
      ) : null}

      {lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun séjour terminé sur cette période.</p>
      ) : (
        <>
          {/* Mobile : une carte par séjour */}
          <ul className="space-y-3 md:hidden print:hidden">
            {lignes.map((l) => (
              <CarteSejour key={l.id} l={l} />
            ))}
          </ul>

          <section className="hidden space-y-4 md:block print:block" aria-label="Détail par séjour">
            <div className="overflow-x-auto rounded-xl border print:overflow-visible print:rounded-none print:border-none">
              <table className="w-full text-[11px] print:text-[10px]">
                <thead>
                  <tr className="border-b bg-muted/50 text-left print:bg-transparent">
                    <th className="p-2 font-medium print:p-1">Départ</th>
                    <th className="p-2 font-medium print:p-1">Client · logement</th>
                    <th className="p-2 font-medium print:p-1">Canal</th>
                    {COLONNES.map((c) => (
                      <th key={c.cle} className="p-2 text-right font-medium print:p-1">{c.titre}</th>
                    ))}
                    {avecAutres ? <th className="p-2 text-right font-medium print:p-1">Autres extras</th> : null}
                    <th className="p-2 text-right font-medium print:p-1">Total</th>
                    <th className="p-2 text-right font-medium print:p-1">Encaissé</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
                      <td className="whitespace-nowrap p-2 print:p-1">{format(l.depart, "d MMM", { locale: fr })}</td>
                      <td className="p-2 print:p-1">
                        <Link href={`/reservations/${l.id}`} className="font-medium hover:underline print:no-underline">{l.client}</Link>
                        <span className="block text-muted-foreground">{l.logement} · {l.nuits} n</span>
                        {l.detail.source === "non_detaille" ? <span className="block text-amber-700 dark:text-amber-400 print:text-black">non détaillé : loyer total</span> : null}
                        {l.detail.source === "note" ? <span className="block text-muted-foreground">détail lu dans la note</span> : null}
                      </td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground print:p-1">{LIBELLE_CANAL[normaliseCanal(l.canal)]}</td>
                      {COLONNES.map((c) => (
                        <Montant key={c.cle} v={l.detail[c.cle]} />
                      ))}
                      {avecAutres ? <Montant v={l.detail.autresExtras} /> : null}
                      <Montant v={totalDetail(l.detail)} fort />
                      <Montant v={l.ventilation.encaisse} />
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold print:bg-transparent">
                    <td className="p-2 print:p-1" colSpan={3}>Total</td>
                    {COLONNES.map((c) => (
                      <Montant key={c.cle} v={total[c.cle]} fort />
                    ))}
                    {avecAutres ? <Montant v={total.autresExtras} fort /> : null}
                    <Montant v={totalDetail(total)} fort />
                    <Montant v={rapport.totaux.encaisse} fort />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground print:text-[9px]">
        Montants en euros (dirhams convertis à {rapport.madParEur.toFixed(2)} MAD pour 1 €). Extra pompe à chaleur = piscine chauffée. Pour Airbnb et Booking.com, la location et le ménage sont ceux de la plateforme, avant commission. Détail des frais de l&apos;agence (ménage, cuisine, dépenses) et prix net après commission : rapport par réservation.
      </p>
      <p className="print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/caisse/rapport/reservations?mois=${cle}`}><FileText className="h-4 w-4" />Rapport par réservation (frais et net)</Link>
        </Button>
      </p>
    </div>
  );
}

function Liste({ titre, lignes, avecReste }: { titre: string; lignes: LigneRapport[]; avecReste?: boolean }) {
  if (lignes.length === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{titre}</p>
      <ul className="flex flex-wrap gap-1.5">
        {lignes.map((l) => (
          <li key={l.id}>
            <Link href={`/reservations/${l.id}`} className="inline-block rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-muted">
              {l.client} · {l.logement} · {format(l.depart, "d MMM", { locale: fr })}
              {avecReste ? ` · reste ${eur(l.ventilation.reste)}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cartouche({ label, valeur, fort }: { label: string; valeur: string; fort?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 print:p-2 ${fort ? "bg-muted/40" : ""}`}>
      <dt className="text-xs text-muted-foreground print:text-[9px]">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{valeur}</dd>
    </div>
  );
}

function Montant({ v, fort }: { v: number; fort?: boolean }) {
  return <td className={`whitespace-nowrap p-2 text-right tabular-nums print:p-1 ${fort ? "font-semibold" : ""}`}>{v === 0 ? "–" : eur(v)}</td>;
}

function CarteSejour({ l }: { l: LigneRapport }) {
  const ligne = (label: string, valeur: number, fort?: boolean) => (
    <div className={`flex items-center justify-between gap-3 ${fort ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{eur(valeur)}</dd>
    </div>
  );
  return (
    <li className="rounded-xl border p-3">
      <Link href={`/reservations/${l.id}`} className="block">
        <p className="font-medium">{l.client}</p>
        <p className="text-xs text-muted-foreground">
          {l.logement} · {LIBELLE_CANAL[normaliseCanal(l.canal)]} · départ le {format(l.depart, "d MMM", { locale: fr })}
        </p>
      </Link>
      <dl className="mt-2 space-y-1 text-sm">
        {COLONNES.map((c) => (l.detail[c.cle] !== 0 || c.cle === "location" ? <div key={c.cle}>{ligne(c.titre, l.detail[c.cle])}</div> : null))}
        {l.detail.autresExtras ? ligne("Autres extras", l.detail.autresExtras) : null}
        {ligne("Total", totalDetail(l.detail), true)}
        {ligne("Encaissé", l.ventilation.encaisse)}
      </dl>
      {l.detail.source === "note" ? <p className="mt-2 text-xs text-muted-foreground">Détail lu dans la note de la réservation.</p> : null}
      {l.detail.source === "non_detaille" ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Non détaillé : loyer total compté en location.</p> : null}
    </li>
  );
}
