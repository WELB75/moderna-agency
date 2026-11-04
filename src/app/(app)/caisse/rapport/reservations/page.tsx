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
import { normaliseCanal, type CanalKey } from "@/lib/canal";

const BASE = "/caisse/rapport/reservations";
const eur = (n: number) => formaterMontant(n, "EUR");

const GROUPES: { cle: CanalKey; titre: string }[] = [
  { cle: "airbnb", titre: "Airbnb" },
  { cle: "booking", titre: "Booking.com" },
  { cle: "direct", titre: "Réservations en direct" },
  { cle: "autre", titre: "Autres canaux" },
];

const somme = (lignes: LigneRapport[], f: (l: LigneRapport) => number) => lignes.reduce((s, l) => s + f(l), 0);
const facture = (l: LigneRapport) => (l.detaille ? l.ventilation.facture : l.facturation.sejour);
const frais = (l: LigneRapport, k: string) => l.ventilation.couts.filter((x) => x.categorie === k).reduce((s, x) => s + x.montant, 0);

function Tableau({ entetes, children, titre, sousTitre }: { entetes: string[]; children: React.ReactNode; titre: string; sousTitre?: string }) {
  return (
    <section className="space-y-2 break-inside-avoid-page print:break-before-auto">
      <div className="flex items-baseline justify-between gap-3 border-b-2 pb-1">
        <h2 className="text-base font-semibold">{titre}</h2>
        {sousTitre ? <p className="text-xs text-muted-foreground">{sousTitre}</p> : null}
      </div>
      <div className="overflow-x-auto rounded-xl border print:overflow-visible print:rounded-none print:border-none">
        <table className="w-full text-[11px] print:text-[10px]">
          <thead>
            <tr className="border-b bg-muted/50 text-left print:bg-transparent">
              {entetes.map((h, i) => (
                <th key={h} className={`p-2 font-medium print:p-1 ${i >= 2 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function CellulesSejour({ l }: { l: LigneRapport }) {
  return (
    <>
      <td className="whitespace-nowrap p-2 print:p-1">{format(l.depart, "d MMM", { locale: fr })}</td>
      <td className="p-2 print:p-1">
        <Link href={`/reservations/${l.id}`} className="font-medium hover:underline print:no-underline">{l.client}</Link>
        <span className="block text-muted-foreground">{l.logement} · {l.nuits} n{l.detaille || l.plateforme ? "" : " · non détaillé"}</span>
        {l.notesPaiement ? <span className="block text-muted-foreground">{l.notesPaiement}</span> : null}
      </td>
    </>
  );
}

function LigneTotal({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <tr className="border-t-2 bg-muted/40 font-semibold print:bg-transparent">
      <td className="p-2 print:p-1" colSpan={2}>{libelle}</td>
      {children}
    </tr>
  );
}

// Airbnb et Booking.com : ce que la plateforme détaille (chambre, ménage, frais de service) et le
// prix net des nuitées, qui ne se calcule pas pareil (voir lib/revenus-plateforme.ts).
function BlocPlateforme({ titre, lignes, cle }: { titre: string; lignes: LigneRapport[]; cle: CanalKey }) {
  const r = (l: LigneRapport, f: (x: NonNullable<LigneRapport["revenus"]>) => number | null) => (l.revenus ? (f(l.revenus) ?? 0) : 0);
  const sansDetail = lignes.filter((l) => !l.revenus).length;
  return (
    <Tableau
      titre={`${titre} · ${lignes.length} séjour${lignes.length > 1 ? "s" : ""}`}
      sousTitre={cle === "airbnb" ? "Net des nuitées = frais de chambre − frais de service hôte" : "Net des nuitées = frais de chambre − frais de service − ménage"}
      entetes={["Départ", "Client · logement", "Frais de chambre", "Frais de ménage", "Frais de service hôte", "Net des nuitées", "Facturé", "Encaissé", "Reste"]}
    >
      {lignes.map((l) => (
        <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
          <CellulesSejour l={l} />
          {l.revenus ? (
            <>
              <Montant v={l.revenus.fraisChambre} />
              <Montant v={l.revenus.fraisMenage} />
              <Montant v={l.revenus.fraisServiceHote === null ? 0 : -l.revenus.fraisServiceHote} />
              <Montant v={l.revenus.prixNetNuitees ?? 0} fort />
            </>
          ) : (
            <td className="p-2 text-center text-muted-foreground print:p-1" colSpan={4}>détail Beds24 pas encore reçu</td>
          )}
          <Montant v={facture(l)} />
          <Montant v={l.ventilation.encaisse} />
          <Montant v={l.ventilation.reste} alerte={l.ventilation.reste > 0} />
        </tr>
      ))}
      <LigneTotal libelle={`Total ${titre}${sansDetail > 0 ? ` (${sansDetail} sans détail)` : ""}`}>
        <Montant v={somme(lignes, (l) => r(l, (x) => x.fraisChambre))} fort />
        <Montant v={somme(lignes, (l) => r(l, (x) => x.fraisMenage))} fort />
        <Montant v={-somme(lignes, (l) => r(l, (x) => x.fraisServiceHote))} fort />
        <Montant v={somme(lignes, (l) => r(l, (x) => x.prixNetNuitees))} fort />
        <Montant v={somme(lignes, facture)} fort />
        <Montant v={somme(lignes, (l) => l.ventilation.encaisse)} fort />
        <Montant v={somme(lignes, (l) => l.ventilation.reste)} fort />
      </LigneTotal>
    </Tableau>
  );
}

function BlocDirect({ titre, lignes }: { titre: string; lignes: LigneRapport[] }) {
  return (
    <Tableau
      titre={`${titre} · ${lignes.length} séjour${lignes.length > 1 ? "s" : ""}`}
      entetes={["Départ", "Client · logement", "Séjour", "Ménage", "Options", "Facturé", "Encaissé", "Reste"]}
    >
      {lignes.map((l) => (
        <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
          <CellulesSejour l={l} />
          <Montant v={l.facturation.sejour} />
          <Montant v={l.facturation.menage} />
          <Montant v={l.facturation.options} />
          <Montant v={facture(l)} fort />
          <Montant v={l.ventilation.encaisse} />
          <Montant v={l.ventilation.reste} alerte={l.ventilation.reste > 0} />
        </tr>
      ))}
      <LigneTotal libelle={`Total ${titre}`}>
        <Montant v={somme(lignes, (l) => l.facturation.sejour)} fort />
        <Montant v={somme(lignes, (l) => l.facturation.menage)} fort />
        <Montant v={somme(lignes, (l) => l.facturation.options)} fort />
        <Montant v={somme(lignes, facture)} fort />
        <Montant v={somme(lignes, (l) => l.ventilation.encaisse)} fort />
        <Montant v={somme(lignes, (l) => l.ventilation.reste)} fort />
      </LigneTotal>
    </Tableau>
  );
}

// Frais de l'agence, tous canaux confondus : ce que coûtent ménage, cuisine et autres dépenses.
function BlocFrais({ lignes, totaux }: { lignes: LigneRapport[]; totaux: { coutMenage: number; coutCuisine: number; coutAutres: number; totalCouts: number; solde: number } }) {
  return (
    <Tableau
      titre="Frais de l'agence et résultat par séjour"
      sousTitre="Tous canaux confondus"
      entetes={["Départ", "Client · logement", "Canal", "Frais ménage", "Frais cuisine", "Autres dépenses", "Total frais", "Encaissé moins frais"]}
    >
      {lignes.map((l) => (
        <tr key={l.id} className="break-inside-avoid border-b align-top last:border-0">
          <CellulesSejour l={l} />
          <td className="p-2 text-right text-muted-foreground print:p-1">{SOURCE_LIBELLE[normaliseCanal(l.canal)]}</td>
          <Montant v={-frais(l, "menage")} />
          <Montant v={-frais(l, "cuisine")} />
          <Montant v={-frais(l, "caisse")} />
          <Montant v={-l.ventilation.couts.reduce((s, x) => s + x.montant, 0)} fort />
          <Montant v={l.ventilation.solde} fort />
        </tr>
      ))}
      <LigneTotal libelle="Total">
        <td />
        <Montant v={-totaux.coutMenage} fort />
        <Montant v={-totaux.coutCuisine} fort />
        <Montant v={-totaux.coutAutres} fort />
        <Montant v={-totaux.totalCouts} fort />
        <Montant v={totaux.solde} fort />
      </LigneTotal>
    </Tableau>
  );
}

const SOURCE_LIBELLE: Record<CanalKey, string> = { airbnb: "Airbnb", booking: "Booking.com", direct: "Direct", autre: "Autre", bloque: "Blocage" };

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

          {/* Ordinateur et impression (Sanaa, 2026-11-04 : « tous les détails bien séparés ») :
              un bloc par canal avec ses propres colonnes et son sous-total, puis un bloc des frais. */}
          <div className="hidden space-y-8 md:block print:block print:space-y-6">
            {GROUPES.map(({ cle, titre }) => {
              const lignes = rapport.lignes.filter((l) => normaliseCanal(l.canal) === cle);
              if (lignes.length === 0) return null;
              return cle === "airbnb" || cle === "booking" ? (
                <BlocPlateforme key={cle} titre={titre} lignes={lignes} cle={cle} />
              ) : (
                <BlocDirect key={cle} titre={titre} lignes={lignes} />
              );
            })}
            <BlocFrais lignes={rapport.lignes} totaux={t} />
          </div>
        </>
      )}

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
