"use client";

import { ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { CanalDot } from "@/components/app/canal-badge";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { SOURCE_META } from "@/lib/canal";
import type { CanalBilan, DepenseBilan, MoisBilan, SejourBilan } from "@/lib/bilan-proprietaire";

// Bilan mensuel de l'espace propriétaire (/cal/[token]) : tuiles de synthèse, graphique des
// loyers par canal mois par mois, puis une ligne par mois (nuits, loyers, dépenses, solde) qui se
// déplie sur le détail des séjours et des dépenses — voir lib/bilan-proprietaire.ts pour les
// règles de calcul. Pas d'état React : le dépliage est un <details> natif, comme les cartes
// d'agenda du tableau de bord.

const CANAUX: CanalBilan[] = ["airbnb", "booking", "direct", "autre"];

const chartConfig: ChartConfig = {
  airbnb: { label: SOURCE_META.airbnb.label, color: "var(--canal-airbnb)" },
  booking: { label: SOURCE_META.booking.label, color: "var(--canal-booking)" },
  direct: { label: SOURCE_META.direct.label, color: "var(--canal-direct)" },
  autre: { label: SOURCE_META.autre.label, color: "var(--canal-autre)" },
};

// Formats déterministes (pas de toLocaleString) : le composant est rendu côté serveur puis
// hydraté — un séparateur de milliers différent entre Node et le navigateur casserait l'hydratation.
function grouper(n: number): string {
  const entier = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 && Math.round(Math.abs(n)) > 0 ? `-${entier}` : entier;
}

function eur(n: number): string {
  return `${grouper(n)} €`;
}

function origine(d: DepenseBilan): string {
  const code = d.devise.trim().toUpperCase();
  const unite = code === "EUR" || code === "€" ? "€" : code === "MAD" || code === "DH" || code === "DHS" ? "DH" : code;
  return `${grouper(d.montantOrigine)} ${unite}`;
}

function jjmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function tickEuros(v: number): string {
  if (v >= 1000) return `${String(Math.round(v / 100) / 10).replace(".", ",")} k€`;
  return `${v} €`;
}

type Datum = {
  cle: string;
  label: string;
  labelLong: string;
  aVenir: boolean;
  loyers: number;
  depenses: number;
} & Record<CanalBilan, number>;

function StatutChip({ statut }: { statut: MoisBilan["statut"] }) {
  if (statut === "en_cours") {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">En cours</span>;
  }
  if (statut === "a_venir") {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">À venir</span>;
  }
  return null;
}

function Tuile({ label, valeur, detail }: { label: string; valeur: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{valeur}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function BilanTooltip({ active, payload, canaux }: { active?: boolean; payload?: { payload: Datum }[]; canaux: CanalBilan[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">
        {d.labelLong}
        {d.aVenir ? <span className="text-muted-foreground"> · à venir</span> : null}
      </p>
      <div className="mt-1.5 space-y-1">
        {canaux
          .filter((c) => d[c] > 0)
          .map((c) => (
            <div key={c} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CanalDot source={c} size="xs" />
                {SOURCE_META[c].label}
              </span>
              <span className="tabular-nums">{eur(d[c])}</span>
            </div>
          ))}
      </div>
      <div className="mt-1.5 space-y-1 border-t pt-1.5">
        <div className="flex items-center justify-between gap-4 font-semibold">
          <span>Loyers</span>
          <span className="tabular-nums">{eur(d.loyers)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-muted-foreground">
          <span>Dépenses</span>
          <span className="tabular-nums">{eur(d.depenses)}</span>
        </div>
      </div>
    </div>
  );
}

function CanauxDuMois({ parCanal }: { parCanal: Record<CanalBilan, number> }) {
  const presents = CANAUX.filter((c) => parCanal[c] > 0);
  if (presents.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
      {presents.map((c) => (
        <span key={c} className="inline-flex items-center gap-1">
          <CanalDot source={c} size="xs" />
          <span className="tabular-nums">{eur(parCanal[c])}</span>
        </span>
      ))}
    </span>
  );
}

function LigneSejour({ s }: { s: SejourBilan }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="tabular-nums text-muted-foreground">
          {jjmm(s.arrivee)} → {jjmm(s.depart)}
        </span>{" "}
        <span className="font-medium">{s.nom}</span>{" "}
        <span className="inline-flex items-center gap-1 align-middle text-muted-foreground">
          <CanalDot source={s.canal} size="xs" />
          {s.canal === "autre" && s.canalLibelle ? s.canalLibelle : SOURCE_META[s.canal].label}
        </span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {s.loyerConnu ? <>{eur(s.montant)}{s.depuisEncaissement ? <span className="ml-1 text-xs text-muted-foreground">(encaissé)</span> : null}</> : <span className="text-muted-foreground">montant non renseigné</span>}
        {s.nuitsDansLeMois < s.nuitsTotal ? (
          <span className="block text-[11px] text-muted-foreground">
            {s.nuitsDansLeMois} nuit{s.nuitsDansLeMois > 1 ? "s" : ""} sur {s.nuitsTotal} ce mois-ci
          </span>
        ) : null}
      </span>
    </li>
  );
}

function LigneDepense({ d }: { d: DepenseBilan }) {
  const convertie = d.devise.trim().toUpperCase() !== "EUR" && d.devise.trim() !== "€";
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="tabular-nums text-muted-foreground">{jjmm(d.date)}</span> <span>{d.libelle}</span>
        {d.categorie === "jardinier" ? <span className="text-muted-foreground"> · jardinage</span> : null}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {eur(d.montantEur)}
        {convertie ? <span className="block text-[11px] text-muted-foreground">{origine(d)}</span> : null}
      </span>
    </li>
  );
}

function LigneMois({ m }: { m: MoisBilan }) {
  const aDuDetail = m.sejours.length > 0 || m.depensesLignes.length > 0;
  const sousTitre = `${m.nuits} nuit${m.nuits > 1 ? "s" : ""} louée${m.nuits > 1 ? "s" : ""}`;

  const resume = (
    <>
      {/* Téléphone : mois à gauche, loyers / dépenses / solde empilés à droite. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 sm:hidden">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.label}</span>
            <StatutChip statut={m.statut} />
          </div>
          <p className="text-xs text-muted-foreground">{sousTitre}</p>
          <CanauxDuMois parCanal={m.parCanal} />
        </div>
        <div className="space-y-0.5 text-right tabular-nums">
          <p className="font-semibold">{eur(m.loyers)}</p>
          <p className="text-xs text-muted-foreground">Dépenses {eur(m.depenses)}</p>
          <p className="text-xs">Solde {eur(m.solde)}</p>
        </div>
      </div>
      {/* Tablette / ordinateur : une colonne par chiffre. */}
      <div className="hidden items-center gap-x-3 sm:grid sm:grid-cols-[minmax(0,1.6fr)_4rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.label}</span>
            <StatutChip statut={m.statut} />
          </div>
          <CanauxDuMois parCanal={m.parCanal} />
        </div>
        <span className="text-right tabular-nums">{m.nuits}</span>
        <span className="text-right font-semibold tabular-nums">{eur(m.loyers)}</span>
        <span className="text-right tabular-nums text-muted-foreground">{eur(m.depenses)}</span>
        <span className="text-right tabular-nums">{eur(m.solde)}</span>
      </div>
    </>
  );

  // Mois sans séjour ni dépense (ex. mois à venir encore vide) : même mise en page, sans dépliage —
  // le chevron est remplacé par un espace de la même largeur pour garder les colonnes alignées.
  if (!aDuDetail) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground">
        <div className="min-w-0 flex-1">{resume}</div>
        <span className="h-4 w-4 shrink-0" aria-hidden />
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 marker:content-none select-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{resume}</div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t bg-muted/30 px-4 py-3 text-xs">
        <div className="space-y-1.5">
          <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Séjours</p>
          {m.sejours.length === 0 ? (
            <p className="text-muted-foreground">Aucun séjour ce mois-ci.</p>
          ) : (
            <ul className="space-y-1.5">
              {m.sejours.map((s) => (
                <LigneSejour key={s.id} s={s} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Dépenses pour le logement</p>
          {m.depensesLignes.length === 0 ? (
            <p className="text-muted-foreground">Aucune dépense enregistrée ce mois-ci.</p>
          ) : (
            <ul className="space-y-1.5">
              {m.depensesLignes.map((d) => (
                <LigneDepense key={d.id} d={d} />
              ))}
            </ul>
          )}
        </div>
        <p className="flex items-center justify-between gap-3 border-t pt-2 font-medium">
          <span>Solde du mois (loyers − dépenses)</span>
          <span className="tabular-nums">{eur(m.solde)}</span>
        </p>
      </div>
    </details>
  );
}

export function BilanProprietaire({ mois }: { mois: MoisBilan[] }) {
  const realises = mois.filter((m) => m.statut !== "a_venir");
  const aVenir = mois.filter((m) => m.statut === "a_venir");
  const somme = (liste: MoisBilan[], cle: "loyers" | "depenses" | "solde") => liste.reduce((t, m) => t + m[cle], 0);
  const nbDepenses = realises.reduce((t, m) => t + m.depensesLignes.length, 0);
  // "Août → Oct. 2026" (même année) ou "Novembre 2026 → Janvier 2027".
  const periode = (liste: MoisBilan[]) => {
    if (liste.length === 0) return "";
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    if (liste.length === 1) return premier.label;
    const memeAnnee = premier.cle.slice(0, 4) === dernier.cle.slice(0, 4);
    const court = (m: MoisBilan) => m.labelCourt.replace(/ \d{2}$/, ""); // "Janv. 27" → "Janv."
    return memeAnnee ? `${court(premier)} → ${court(dernier)} ${dernier.cle.slice(0, 4)}` : `${premier.label} → ${dernier.label}`;
  };

  const totalParCanal = CANAUX.map((c) => mois.reduce((t, m) => t + m.parCanal[c], 0));
  const canaux = CANAUX.filter((c, i) => totalParCanal[i] > 0 || (c !== "autre" && totalParCanal.every((t) => t === 0)));

  const data: Datum[] = mois.map((m) => ({
    cle: m.cle,
    label: m.labelCourt,
    labelLong: m.label,
    aVenir: m.statut === "a_venir",
    loyers: Math.round(m.loyers),
    depenses: Math.round(m.depenses),
    airbnb: Math.round(m.parCanal.airbnb),
    booking: Math.round(m.parCanal.booking),
    direct: Math.round(m.parCanal.direct),
    autre: Math.round(m.parCanal.autre),
  }));

  const rienDuTout = mois.every((m) => m.nuits === 0 && m.depensesLignes.length === 0);
  if (rienDuTout) {
    return (
      <div className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Aucun séjour ni dépense enregistrés depuis août 2026.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tuile label="Loyers" valeur={eur(somme(realises, "loyers"))} detail={periode(realises)} />
        <Tuile
          label="Dépenses pour le logement"
          valeur={eur(somme(realises, "depenses"))}
          detail={nbDepenses === 0 ? "Aucune dépense enregistrée" : `${nbDepenses} dépense${nbDepenses > 1 ? "s" : ""} enregistrée${nbDepenses > 1 ? "s" : ""}`}
        />
        <Tuile label="Solde" valeur={eur(somme(realises, "solde"))} detail="Loyers − dépenses" />
        <Tuile
          label="À venir"
          valeur={aVenir.length === 0 ? "—" : eur(somme(aVenir, "loyers"))}
          detail={aVenir.length === 0 ? "Aucune réservation sur les mois à venir" : `${periode(aVenir)} · déjà réservé`}
        />
      </div>

      <div className="rounded-xl border bg-card px-2 pb-3 pt-4 sm:px-4">
        <ChartContainer config={chartConfig} className="h-52 w-full sm:h-60">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} interval={data.length <= 8 ? 0 : "preserveStartEnd"} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={tickEuros} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<BilanTooltip canaux={canaux} />} />
            {canaux.map((c) => (
              <Bar key={c} dataKey={c} stackId="loyers" fill={`var(--color-${c})`} maxBarSize={28} isAnimationActive={false} stroke="var(--card)" strokeWidth={1}>
                {data.map((d) => (
                  <Cell key={d.cle} fillOpacity={d.aVenir ? 0.45 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
          {canaux.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <CanalDot source={c} size="xs" />
              {SOURCE_META[c].label}
            </span>
          ))}
          {aVenir.length > 0 ? <span className="sm:ml-auto">Barres atténuées : mois à venir, déjà réservés.</span> : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card text-sm">
        {/* pr-10 = padding de ligne (1rem) + chevron (1rem) + son écart (0.5rem), pour que les
            colonnes de l'en-tête tombent sur celles des lignes. */}
        <div className="hidden gap-x-3 border-b py-2 pl-4 pr-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.6fr)_4rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <span>Mois</span>
          <span className="text-right">Nuits</span>
          <span className="text-right">Loyers</span>
          <span className="text-right">Dépenses</span>
          <span className="text-right">Solde</span>
        </div>
        <div className="divide-y">
          {mois.map((m) => (
            <LigneMois key={m.cle} m={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
