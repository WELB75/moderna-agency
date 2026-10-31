import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, FileSignature, FileText, ShieldCheck, type LucideIcon } from "lucide-react";
import { EcheanceDocuments } from "@/components/app/echeance-documents";
import { calculerEcheance, echeanceDocuments } from "@/lib/echeance-documents";
import { chargerArriveesDocuments, progressionFiche } from "@/lib/arrivees-documents";
import { CanalDot } from "@/components/app/canal-badge";
import { cn } from "@/lib/utils";
import { RowChevron, RowIcon, RowTitle, StatusDot, summaryRowClass } from "@/components/app/dashboard-ui";

// Suivi des arrivées (accueil) — Fouad, 2026-10-16 : "je veux que tout soit connecté : s'ils ont
// fait la fiche police ou pas via le lien, s'ils ont payé via Stripe ou pas, et que nous, en
// interne dans le logiciel, on le voie. On voit où ça en est et combien de temps il reste."
//
// Pour chaque arrivée des 7 prochains jours : fiche police (remplie par le voyageur sur /g/[id],
// lien envoyé par Beds24), caution (empreinte Stripe détectée par la synchro Beds24 via l'info
// code STRIPEAUTHORIZE, voir sync.ts) et temps restant avant l'arrivée.
//
// Les heures d'envoi reprennent les actions automatiques Beds24 : fiche police J-2 à 10h (action
// "10 - J-2 10h : fiche police"), lien caution J-1 à 10h puis rappel le jour J à 10h ("Caution
// ... - lien J-1 10h"). Ce sont les heures prévues, pas une confirmation d'envoi : une réservation
// faite à la dernière minute reçoit ses liens dès la réservation.

// 2026-10-30 (Fouad) : « la fiche police et le contrat doivent être réglés 24 h avant l'arrivée ».
// Le bloc suit donc aussi le contrat, et chaque arrivée porte un compte à rebours jusqu'à cette
// limite J-1 (lib/echeance-documents.ts) ; les arrivées en retard remontent en tête de liste.

const NB_JOURS = 7;

type StatutTone = "ok" | "attente" | "urgent" | "neutre";

type Statut = { tone: StatutTone; label: string; detail?: string };

const TONE_CLASSES: Record<StatutTone, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400",
  attente: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:border-amber-500/20 dark:text-amber-400",
  urgent: "border-red-500/30 bg-red-500/5 text-red-700 dark:border-red-500/20 dark:text-red-400",
  neutre: "border-border bg-muted/40 text-muted-foreground",
};

// Même convention que toDateTime() dans beds24/sync.ts : les dates de l'app portent l'heure
// "affichée" au Maroc dans leurs champs UTC (voir nowInMorocco).
function aJourHeure(reference: Date, decalageJours: number, heure: number): Date {
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + decalageJours, heure, 0, 0)
  );
}

function tempsRestant(cible: Date, now: Date): string {
  const ms = cible.getTime() - now.getTime();
  if (ms <= 0) return "Arrivé";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `dans ${Math.max(1, minutes)} min`;
  const heures = Math.floor(ms / 3_600_000);
  if (heures < 24) return `dans ${heures} h`;
  const jours = Math.floor(heures / 24);
  const reste = heures % 24;
  return reste > 0 ? `dans ${jours} j ${reste} h` : `dans ${jours} j`;
}

function quand(date: Date): string {
  return format(date, "EEE d MMM 'à' HH'h'", { locale: fr });
}

function formatMontant(montant: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(montant)} €`;
}

export function statutCaution(
  r: { canal: string | null; caution: string | null; cautionPayee: boolean; checkIn: Date },
  now: Date
): Statut {
  const montant = r.caution ? Number(r.caution) : 0;
  if (r.cautionPayee) return { tone: "ok", label: montant > 0 ? `Reçue · ${formatMontant(montant)}` : "Reçue" };
  if (montant <= 0) {
    return { tone: "neutre", label: (r.canal ?? "").toLowerCase().includes("airbnb") ? "Pas de caution (Airbnb)" : "Pas de caution" };
  }
  const lien = aJourHeure(r.checkIn, -1, 10);
  if (now < lien) return { tone: "neutre", label: `${formatMontant(montant)} · lien pas encore envoyé`, detail: `Envoi prévu ${quand(lien)}` };
  if (now >= r.checkIn) return { tone: "urgent", label: `Non reçue · ${formatMontant(montant)}`, detail: "Voyageur arrivé sans empreinte" };
  const rappel = aJourHeure(r.checkIn, 0, 10);
  return {
    tone: "attente",
    label: `En attente · ${formatMontant(montant)}`,
    detail: now < rappel ? `Lien envoyé · rappel ${quand(rappel)}` : "Lien et rappel envoyés",
  };
}

// `progression` : « 2/4 passeports » quand une partie du groupe s'est déjà enregistrée
// (enregistrement voyageur par voyageur, 2026-10-31) — remplace alors « En attente ».
export function statutFichePolice(
  r: { checkIn: Date },
  fiche: "complete" | "en_attente" | null,
  now: Date,
  progression: string | null = null
): Statut {
  if (fiche === "complete") return { tone: "ok", label: "Faite" };
  const lien = aJourHeure(r.checkIn, -2, 10);
  const enCours = progression ?? "En attente";
  if (now >= r.checkIn) return { tone: "urgent", label: progression ?? "Manquante", detail: "Voyageur arrivé sans fiche complète" };
  if (now >= echeanceDocuments(r.checkIn)) return { tone: "urgent", label: enCours, detail: "Limite J-1 dépassée" };
  if (progression) return { tone: "attente", label: progression, detail: "Il manque encore des passeports" };
  if (now < lien) return { tone: "neutre", label: "Lien pas encore envoyé", detail: `Envoi prévu ${quand(lien)}` };
  return { tone: "attente", label: enCours, detail: "Lien envoyé, pas encore remplie" };
}

export function statutContrat(r: { checkIn: Date }, contrat: "signe" | "en_attente" | null, now: Date): Statut {
  if (contrat === "signe") return { tone: "ok", label: "Signé" };
  if (now >= r.checkIn) return { tone: "urgent", label: "Non signé", detail: "Voyageur arrivé sans contrat" };
  if (now >= echeanceDocuments(r.checkIn)) return { tone: "urgent", label: "À signer", detail: "Limite J-1 dépassée" };
  return { tone: "attente", label: "À signer", detail: contrat ? "Lien envoyé, pas encore signé" : "Pas encore généré" };
}

function StatutChip({ icon: Icon, titre, statut, href }: { icon: LucideIcon; titre: string; statut: Statut; href?: string }) {
  const contenu = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-muted-foreground">{titre} ·</span>
        <span className="font-medium">{statut.label}</span>
      </span>
      {statut.detail ? <span className="block text-[11px] text-muted-foreground">{statut.detail}</span> : null}
    </>
  );
  const classes = cn("block min-w-0 rounded-md border px-2 py-1 text-xs", TONE_CLASSES[statut.tone]);
  return href ? (
    <Link href={href} className={cn(classes, "transition-opacity hover:opacity-80")}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}

export async function SuiviArrivees({ now }: { now: Date }) {
  // Chargement commun avec les tuiles « Prochaines échéances » (lib/arrivees-documents.ts).
  const arrivees = await chargerArriveesDocuments(now, NB_JOURS);

  const lignes = arrivees
    .map((r) => ({
      ...r,
      caution: statutCaution(r, now),
      police: statutFichePolice(r, r.ficheStatut, now, progressionFiche(r.fiche)),
      conditions: statutContrat(r, r.contratStatut, now),
      echeance: calculerEcheance({ checkIn: r.checkIn, ficheStatut: r.ficheStatut, contratStatut: r.contratStatut }, now),
    }))
    // Ce qui est en retard (limite J-1 dépassée, ou arrivé sans papiers) en tête, puis par
    // arrivée : on voit d'abord ce qu'il faut traiter tout de suite.
    .sort((a, b) => {
      const ua = a.echeance.tone === "urgent" || a.caution.tone === "urgent" ? 0 : 1;
      const ub = b.echeance.tone === "urgent" || b.caution.tone === "urgent" ? 0 : 1;
      return ua - ub || a.checkIn.getTime() - b.checkIn.getTime();
    });

  const documentsARegler = lignes.filter((l) => l.echeance.etat === "a_temps" || l.echeance.etat === "bientot").length;
  const documentsEnRetard = lignes.filter((l) => l.echeance.etat === "retard" || l.echeance.etat === "arrive").length;
  const cautionsEnAttente = lignes.filter((l) => l.caution.tone === "attente" || l.caution.tone === "urgent").length;
  const urgents = lignes.filter((l) => l.echeance.tone === "urgent" || l.caution.tone === "urgent").length;
  // Prochaine limite J-1 à venir avec des documents encore manquants : affichée dans la ligne repliée.
  const prochaine = lignes.find((l) => l.echeance.etat === "a_temps" || l.echeance.etat === "bientot");
  const toutEnOrdre = lignes.length > 0 && urgents === 0 && documentsARegler === 0 && cautionsEnAttente === 0;

  // Toujours replié au chargement (Kamel, 2026-10-16 puis 2026-10-19 : trop de place, surtout sur
  // mobile) ; l'urgence reste visible en rouge dans la ligne du résumé. Ligne de résumé au même
  // gabarit que les autres blocs de l'accueil (voir dashboard-ui.tsx).
  const tone: StatutTone = urgents > 0 ? "urgent" : documentsARegler + cautionsEnAttente > 0 ? "attente" : "ok";
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className={summaryRowClass}>
        <RowIcon icon={ShieldCheck} tone={tone} />
        <RowTitle
          sub={
            lignes.length === 0 ? (
              "Aucune arrivée dans les 7 prochains jours"
            ) : toutEnOrdre ? (
              <StatusDot tone="ok">Tout est en ordre : fiches police, contrats et cautions réglés</StatusDot>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {documentsEnRetard > 0 ? (
                  <StatusDot tone="urgent">
                    {documentsEnRetard} en retard (limite J-1 dépassée)
                  </StatusDot>
                ) : null}
                <StatusDot tone={documentsARegler > 0 ? "attente" : "ok"}>
                  {documentsARegler} fiche{documentsARegler > 1 ? "s" : ""}/contrat{documentsARegler > 1 ? "s" : ""} à régler avant J-1
                </StatusDot>
                <StatusDot tone={cautionsEnAttente > 0 ? "attente" : "ok"}>
                  {cautionsEnAttente} caution{cautionsEnAttente > 1 ? "s" : ""} en attente
                </StatusDot>
                {prochaine ? (
                  <span className="hidden sm:inline">
                    Prochaine limite : {prochaine.villaNom ?? "Logement"} {tempsRestant(echeanceDocuments(prochaine.checkIn), now)}
                  </span>
                ) : null}
              </span>
            )
          }
        >
          Fiche police, contrat et caution
          <span className="ml-1.5 font-normal text-muted-foreground">· 7 jours</span>
        </RowTitle>
        {lignes.length > 0 ? (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {lignes.length} arrivée{lignes.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <RowChevron />
      </summary>

      {lignes.length === 0 ? null : (
        <ul className="divide-y divide-border border-t border-border">
          {lignes.map((l) => {
            const urgent = l.echeance.tone === "urgent" || l.caution.tone === "urgent";
            const restant = tempsRestant(l.checkIn, now);
            return (
              <li
                key={l.id}
                className={cn(
                  "grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-3",
                  urgent && "bg-red-500/[0.03]"
                )}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Link href={`/reservations/${l.id}`} className="flex min-w-0 items-center gap-2.5 hover:opacity-80">
                    <CanalDot canal={l.canal} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.villaNom ?? "Logement"} · {l.guestName}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        Arrivée {format(l.checkIn, "EEE d MMM 'à' HH'h'", { locale: fr })} ·{" "}
                        <span className={cn("font-medium", urgent ? "text-red-600 dark:text-red-400" : "text-foreground")}>{restant}</span>
                      </span>
                    </span>
                  </Link>
                  {/* Compte à rebours jusqu'à la limite J-1 (24 h avant l'arrivée). */}
                  <EcheanceDocuments checkIn={l.checkIn} ficheStatut={l.ficheStatut} contratStatut={l.contratStatut} variant="pastille" className="self-start" />
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:contents">
                  <StatutChip
                    icon={FileText}
                    titre="Fiche police"
                    statut={l.police}
                    href={l.fiche ? (l.fiche.statut === "complete" ? `/gendarmerie/${l.fiche.id}` : `/g/${l.fiche.id}`) : undefined}
                  />
                  <StatutChip
                    icon={FileSignature}
                    titre="Contrat"
                    statut={l.conditions}
                    href={l.contrat?.statut === "signe" ? `/contrats/${l.contrat.id}` : `/reservations/${l.id}`}
                  />
                  <StatutChip icon={ShieldCheck} titre="Caution" statut={l.caution} href={`/reservations/${l.id}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
