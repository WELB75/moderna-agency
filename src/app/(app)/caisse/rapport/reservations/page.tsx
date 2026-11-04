import Link from "next/link";
import { addMonths, format, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/app/print-button";
import { Logo } from "@/components/app/logo";
import { moisHref, periodeAncre, periodeBounds } from "@/lib/caisse-periode";
import { chargerRapportCompta, type LigneRapport } from "@/lib/compta-rapport";
import { formaterMontant } from "@/lib/compta-reservation-format";

const BASE = "/caisse/rapport/reservations";
const eur = (n: number) => formaterMontant(n, "EUR");

export default async function RapportReservationsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois } = await searchParams;
  const ancre = periodeAncre(mois);
  const { debut, finAffichee } = periodeBounds(ancre);
  const rapport = await chargerRapportCompta(ancre);
  const t = rapport.totaux;
  const cle = format(ancre, "yyyy-MM");

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 print:max-w-none print:p-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="font-semibold">Comptabilité par réservation</p>
          <p className="text-sm text-muted-foreground">
            Séjours terminés du {format(debut, "d MMM", { locale: fr })} au {format(finAffichee, "d MMM yyyy", { locale: fr })} · {rapport.lignes.length} séjour{rapport.lignes.length > 1 ? "s" : ""}
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
            <a href={`/api/compta/rapport-csv?mois=${cle}`}><Download className="h-4 w-4" />Excel (CSV)</a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <div className="hidden items-center justify-between print:flex">
        <Logo size={56} />
        <div className="text-right">
          <p className="text-lg font-semibold">Comptabilité par réservation</p>
          <p className="text-sm text-muted-foreground">
            Séjours terminés du {format(debut, "d MMMM", { locale: fr })} au {format(finAffichee, "d MMMM yyyy", { locale: fr })}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
        <Cartouche label="Facturé" valeur={eur(t.facture)} />
        <Cartouche label="Encaissé" valeur={eur(t.encaisse)} />
        <Cartouche label="Reste à encaisser" valeur={eur(t.reste)} />
        <Cartouche label="Encaissé moins frais" valeur={eur(t.solde)} />
        <Cartouche label="Séjour (nuitées)" valeur={eur(t.sejour)} petit />
        <Cartouche label="Ménage facturé" valeur={eur(t.menage)} petit />
        <Cartouche label="Options facturées" valeur={eur(t.options)} petit />
        <Cartouche label={`Frais : ménage ${eur(t.coutMenage)} · cuisine ${eur(t.coutCuisine)} · autres ${eur(t.coutAutres)}`} valeur={eur(t.totalCouts)} petit />
      </dl>

      {t.nonDetailles > 0 ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 print:hidden">
          {t.nonDetailles} séjour{t.nonDetailles > 1 ? "s" : ""} sans détail financier : seul le loyer total est connu et il est compté en « séjour ». Ouvrir la réservation pour ventiler ménage et options.
        </p>
      ) : null}

      {rapport.lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun séjour terminé sur cette période.</p>
      ) : (
        <>
          {/* Mobile : une carte par séjour */}
          <ul className="space-y-3 md:hidden print:hidden">
            {rapport.lignes.map((l) => (
              <CarteSejour key={l.id} l={l} />
            ))}
          </ul>

          {/* Ordinateur et impression : tableau */}
          <div className="hidden overflow-x-auto rounded-xl border md:block print:block print:overflow-visible print:rounded-none print:border-none">
            <table className="w-full text-[11px] print:text-[9px]">
              <thead>
                <tr className="border-b bg-muted/50 text-left print:bg-transparent">
                  {["Départ", "Client · logement", "Séjour", "Ménage", "Options", "Facturé", "Encaissé", "Reste", "Frais ménage", "Frais cuisine", "Autres", "Net"].map((h, i) => (
                    <th key={h} className={`p-2 font-medium print:p-1 ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rapport.lignes.map((l) => {
                  const c = (k: string) => l.ventilation.couts.filter((x) => x.categorie === k).reduce((s, x) => s + x.montant, 0);
                  return (
                    <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
                      <td className="whitespace-nowrap p-2 print:p-1">{format(l.depart, "d MMM", { locale: fr })}</td>
                      <td className="p-2 print:p-1">
                        <Link href={`/reservations/${l.id}`} className="font-medium hover:underline print:no-underline">{l.client}</Link>
                        <span className="block text-muted-foreground">{l.logement} · {l.canal} · {l.nuits} n{l.detaille ? "" : " · non détaillé"}</span>
                        {l.notesPaiement ? <span className="block text-muted-foreground">{l.notesPaiement}</span> : null}
                      </td>
                      <Montant v={l.facturation.sejour} />
                      <Montant v={l.facturation.menage} />
                      <Montant v={l.facturation.options} />
                      <Montant v={l.detaille ? l.ventilation.facture : l.facturation.sejour} fort />
                      <Montant v={l.ventilation.encaisse} />
                      <Montant v={l.ventilation.reste} alerte={l.ventilation.reste > 0} />
                      <Montant v={-c("menage")} />
                      <Montant v={-c("cuisine")} />
                      <Montant v={-c("caisse")} />
                      <Montant v={l.ventilation.solde} fort />
                    </tr>
                  );
                })}
                <tr className="border-t-2 bg-muted/40 font-semibold print:bg-transparent">
                  <td className="p-2 print:p-1" colSpan={2}>Total</td>
                  <Montant v={t.sejour} fort /><Montant v={t.menage} fort /><Montant v={t.options} fort />
                  <Montant v={t.facture} fort /><Montant v={t.encaisse} fort /><Montant v={t.reste} fort />
                  <Montant v={-t.coutMenage} fort /><Montant v={-t.coutCuisine} fort /><Montant v={-t.coutAutres} fort />
                  <Montant v={t.solde} fort />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {rapport.plateformes.nb > 0 ? (
        <section className="space-y-3 break-before-page">
          <div>
            <h2 className="text-base font-semibold">Revenus Airbnb et Booking.com</h2>
            <p className="text-sm text-muted-foreground print:text-xs">
              Prix net des nuitées = frais de chambre − frais de service hôte (Booking.com : moins aussi les frais de ménage).
              {rapport.plateformes.sansDetail > 0 ? ` ${rapport.plateformes.sansDetail} séjour(s) sans détail reçu de Beds24 pour le moment.` : ""}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border print:overflow-visible print:rounded-none print:border-none">
            <table className="w-full text-[11px] print:text-[9px]">
              <thead>
                <tr className="border-b bg-muted/50 text-left print:bg-transparent">
                  {["Départ", "Client · logement", "Frais de chambre", "Frais de ménage", "Frais de service hôte", "Prix net des nuitées"].map((h, i) => (
                    <th key={h} className={`p-2 font-medium print:p-1 ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rapport.lignes.filter((l) => l.plateforme).map((l) => (
                  <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
                    <td className="whitespace-nowrap p-2 print:p-1">{format(l.depart, "d MMM", { locale: fr })}</td>
                    <td className="p-2 print:p-1">
                      <Link href={`/reservations/${l.id}`} className="font-medium hover:underline print:no-underline">{l.client}</Link>
                      <span className="block text-muted-foreground">{l.logement} · {l.canal} · {l.nuits} n</span>
                    </td>
                    {l.revenus ? (
                      <>
                        <Montant v={l.revenus.fraisChambre} />
                        <Montant v={l.revenus.fraisMenage} />
                        <Montant v={l.revenus.fraisServiceHote === null ? 0 : -l.revenus.fraisServiceHote} />
                        <Montant v={l.revenus.prixNetNuitees ?? 0} fort />
                      </>
                    ) : (
                      <td className="p-2 text-right text-muted-foreground print:p-1" colSpan={4}>détail Beds24 pas encore reçu</td>
                    )}
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/40 font-semibold print:bg-transparent">
                  <td className="p-2 print:p-1" colSpan={2}>Total</td>
                  <Montant v={rapport.plateformes.fraisChambre} fort />
                  <Montant v={rapport.plateformes.fraisMenage} fort />
                  <Montant v={-rapport.plateformes.fraisService} fort />
                  <Montant v={rapport.plateformes.net} fort />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Montants en euros (dirhams convertis à {rapport.madParEur.toFixed(2)} MAD pour 1 €). Les frais de ménage et de cuisine viennent de la caisse quand une dépense est rattachée au séjour, sinon du barème de l&apos;agence (200 MAD par ménage, 100 ou 200 MAD par jour de cuisine). Commission des plateformes non déduite.
      </p>
    </div>
  );
}

function Cartouche({ label, valeur, petit }: { label: string; valeur: string; petit?: boolean }) {
  return (
    <div className="rounded-xl border p-3 print:p-2">
      <dt className="text-xs text-muted-foreground print:text-[9px]">{label}</dt>
      <dd className={`mt-0.5 font-semibold tabular-nums ${petit ? "text-sm" : "text-lg"}`}>{valeur}</dd>
    </div>
  );
}

function Montant({ v, fort, alerte }: { v: number; fort?: boolean; alerte?: boolean }) {
  return (
    <td className={`whitespace-nowrap p-2 text-right tabular-nums print:p-1 ${fort ? "font-semibold" : ""} ${alerte ? "text-amber-700 dark:text-amber-400 print:text-black" : ""}`}>
      {v === 0 ? "–" : eur(v)}
    </td>
  );
}

function CarteSejour({ l }: { l: LigneRapport }) {
  const v = l.ventilation;
  const ligne = (label: string, valeur: string, fort?: boolean) => (
    <div className={`flex items-center justify-between gap-3 ${fort ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{valeur}</dd>
    </div>
  );
  const frais = (k: string) => v.couts.filter((x) => x.categorie === k).reduce((s, x) => s + x.montant, 0);
  return (
    <li className="rounded-xl border p-3">
      <Link href={`/reservations/${l.id}`} className="block">
        <p className="font-medium">{l.client}</p>
        <p className="text-xs text-muted-foreground">
          {l.logement} · {l.canal} · départ le {format(l.depart, "d MMM", { locale: fr })}{l.detaille ? "" : " · non détaillé"}
        </p>
      </Link>
      <dl className="mt-2 space-y-1 text-sm">
        {ligne("Séjour", eur(l.facturation.sejour))}
        {l.facturation.menage ? ligne("Ménage facturé", eur(l.facturation.menage)) : null}
        {l.facturation.options ? ligne("Options", eur(l.facturation.options)) : null}
        {ligne("Facturé", eur(l.detaille ? v.facture : l.facturation.sejour), true)}
        {ligne("Encaissé", eur(v.encaisse))}
        {v.reste > 0 ? ligne("Reste", eur(v.reste)) : null}
        {frais("menage") ? ligne("Frais ménage", `− ${eur(frais("menage"))}`) : null}
        {frais("cuisine") ? ligne("Frais cuisine", `− ${eur(frais("cuisine"))}`) : null}
        {frais("caisse") ? ligne("Autres dépenses", `− ${eur(frais("caisse"))}`) : null}
        {ligne("Encaissé moins frais", eur(v.solde), true)}
      </dl>
      {l.notesPaiement ? <p className="mt-2 text-xs text-muted-foreground">{l.notesPaiement}</p> : null}
    </li>
  );
}
