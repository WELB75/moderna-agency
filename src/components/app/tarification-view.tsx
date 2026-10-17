"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEstMobile } from "@/lib/use-est-mobile";
import Image from "next/image";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, ChevronDown, ChevronsUpDown, ChevronUp, Info, RefreshCw, Search } from "lucide-react";
import { PhoneLink } from "@/components/app/phone-link";
import { EditNotesButton } from "@/components/app/edit-notes-button";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteReservation } from "@/lib/actions/reservations";
import { CanalBadge, CanalDot } from "@/components/app/canal-badge";
import { canalPlanningStyle, normaliseCanal, SOURCE_META } from "@/lib/canal";
import type { TarificationReservation, TarificationVilla } from "@/lib/pricelabs/sync";
import { formatHeureMaroc } from "@/lib/journal-format";

// lectureSeule : lien public "calendrier seul" d'un logement (/cal/[token], voir
// lib/calendrier-partage.ts) — même grille, mais sans recherche/filtres, sans bouton
// "Actualiser les prix" ni détails Beds24 (routes réservées à l'équipe connectée), et un
// récapitulatif de réservation sans téléphone, montants, notes ni actions.
export function TarificationView({
  initialVillas,
  lectureSeule = false,
}: {
  initialVillas: TarificationVilla[];
  lectureSeule?: boolean;
}) {
  const [villasTarifs, setVillasTarifs] = useState(initialVillas);
  const [search, setSearch] = useState("");
  // Bascule en un clic entre tous les logements, les appartements (les "cosy") et les villas —
  // Kamel, 2026-10-14.
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "appartement" | "villa">("tous");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const villasFiltrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const parType = typeFiltre === "tous" ? villasTarifs : villasTarifs.filter((v) => v.type === typeFiltre);
    if (!q) return parType;
    return parType.filter((v) => v.nom.toLowerCase().includes(q) || v.numero.toLowerCase().includes(q));
  }, [villasTarifs, search, typeFiltre]);

  const plusAncienneSynchro = useMemo(() => {
    const dates = villasTarifs.map((v) => v.syncedAt).filter((d): d is string => Boolean(d));
    if (dates.length === 0) return null;
    return dates.reduce((oldest, d) => (new Date(d) < new Date(oldest) ? d : oldest));
  }, [villasTarifs]);

  function handleNotesUpdated(villaId: string, reservationId: string, notes: string) {
    setVillasTarifs((prev) =>
      prev.map((v) =>
        v.id !== villaId
          ? v
          : { ...v, reservations: v.reservations.map((r) => (r.id === reservationId ? { ...r, notes: notes || null } : r)) }
      )
    );
  }

  function handleReservationSupprimee(villaId: string, reservationId: string) {
    setVillasTarifs((prev) =>
      prev.map((v) => (v.id !== villaId ? v : { ...v, reservations: v.reservations.filter((r) => r.id !== reservationId) }))
    );
  }

  async function actualiser() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/tarification?refresh=1");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { villas: TarificationVilla[] };
      setVillasTarifs(data.villas);
    } catch {
      setLoadError("Prix temporairement indisponibles, réessayez plus tard.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {lectureSeule ? (
        plusAncienneSynchro ? (
          <p className="text-xs text-muted-foreground">
            Prix mis à jour {formatDistanceToNow(parseISO(plusAncienneSynchro), { addSuffix: true, locale: fr })}
          </p>
        ) : null
      ) : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un logement..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border bg-muted p-0.5 text-sm" role="group" aria-label="Type de logement">
            {(
              [
                ["tous", `Tous (${villasTarifs.length})`],
                ["appartement", `Appartements (${villasTarifs.filter((v) => v.type === "appartement").length})`],
                ["villa", `Villas (${villasTarifs.filter((v) => v.type === "villa").length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTypeFiltre(value)}
                aria-pressed={typeFiltre === value}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  typeFiltre === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {plusAncienneSynchro ? (
            <p className="text-xs text-muted-foreground">
              Prix mis à jour {formatDistanceToNow(parseISO(plusAncienneSynchro), { addSuffix: true, locale: fr })}
            </p>
          ) : null}
          <Button variant="outline" size="sm" onClick={actualiser} disabled={loading} className="flex-1 sm:flex-none">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser les prix
          </Button>
        </div>
      </div>
      )}

      {loadError ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : null}

      {villasTarifs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Building2 className="h-8 w-8" />
            <p>Aucun logement relié à PriceLabs pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : villasFiltrees.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Aucun logement ne correspond à la recherche.</CardContent>
        </Card>
      ) : (
        <TarificationCalendrier
          villas={villasFiltrees}
          lectureSeule={lectureSeule}
          onNotesUpdated={handleNotesUpdated}
          onReservationSupprimee={handleReservationSupprimee}
        />
      )}
    </div>
  );
}

// Vue planning calquée sur SuperHote v2 (captures envoyées le 2026-10-13 : "le calendrier doit
// ressembler à ça") : colonnes larges avec jour de la semaine + grand numéro, week-ends grisés,
// aujourd'hui en rouge avec un trait vertical, prix "350€" dans les cases libres, et barres de
// réservation qui démarrent au milieu de la case d'arrivée et s'arrêtent au milieu de la case de
// départ, colorées et marquées du logo de leur canal (Airbnb / Booking.com / Direct).
const CALENDAR_DAYS = 365;

// Même grille sur ordinateur et sur smartphone ; seules les dimensions changent (Kamel, 2026-10-15 :
// "je veux le même style de vue pour la version smartphone"). Mobile : colonne des logements
// étroite (nom sur deux lignes, sans photo), colonnes de jours plus fines, tout défile au pouce.
type Dims = {
  col: number;
  sidebar: number;
  row: number;
  headerMonth: number;
  headerDays: number;
  detailRow: number;
  compact: boolean;
};
const DIMS_BUREAU: Dims = { col: 64, sidebar: 260, row: 64, headerMonth: 56, headerDays: 64, detailRow: 44, compact: false };
const DIMS_MOBILE: Dims = { col: 52, sidebar: 104, row: 60, headerMonth: 48, headerDays: 56, detailRow: 44, compact: true };

// Lignes de détail affichées sous une villa dépliée, dans l'ordre de SuperHote v2.
const LIGNES_DETAIL = [
  { key: "prix", label: "Prix nuitée", aide: null },
  { key: "min", label: "Nombre de nuits minimum", aide: "Durée minimale d'un séjour qui commence ce jour-là." },
  { key: "max", label: "Nombre de nuits maximum", aide: "Durée maximale d'un séjour qui commence ce jour-là." },
  { key: "arrivee", label: "Arrivées bloquées", aide: "Oui = aucun voyageur ne peut arriver ce jour-là." },
  { key: "depart", label: "Départs bloqués", aide: "Oui = aucun voyageur ne peut partir ce jour-là." },
] as const;
// Comme SuperHote : on garde quelques jours de passé à gauche d'aujourd'hui (séjours qui viennent
// de se terminer, affichés grisés).
const JOURS_PASSES_PLANNING = 4;

type ReservationSelectionnee = { villaId: string; villaNom: string } & TarificationReservation;

// Point d'entrée commun aux deux mises en page (grille desktop façon Airbnb, liste de cartes en
// mobile) : un seul état de réservation sélectionnée et un seul dialogue de récapitulatif,
// partagés entre les deux, pour ne jamais avoir deux popups indépendants qui se désynchronisent.
// Kamel, 2026-09-29 : "adapte au maximum aussi la version smartphone [...] faut faire la
// meilleure version mobile du monde" — la grille large à colonnes fixes ne marche juste pas au
// doigt sur un écran de 380px (colonne des logements qui mange tout l'écran, défilement pénible
// avec une barre latérale figée) : plutôt qu'une version resserrée de la même grille, le mobile
// a sa propre mise en page, une carte par logement avec sa bande de jours défilable au pouce.
function TarificationCalendrier({
  villas,
  lectureSeule,
  onNotesUpdated,
  onReservationSupprimee,
}: {
  villas: TarificationVilla[];
  lectureSeule: boolean;
  onNotesUpdated: (villaId: string, reservationId: string, notes: string) => void;
  onReservationSupprimee: (villaId: string, reservationId: string) => void;
}) {
  const [resaSelectionnee, setResaSelectionnee] = useState<ReservationSelectionnee | null>(null);
  const estMobile = useEstMobile();

  function handleNotesSaved(notes: string) {
    if (!resaSelectionnee) return;
    setResaSelectionnee({ ...resaSelectionnee, notes: notes || null });
    onNotesUpdated(resaSelectionnee.villaId, resaSelectionnee.id, notes);
  }

  return (
    <>
      <TarificationGrid
        villas={villas}
        dims={estMobile ? DIMS_MOBILE : DIMS_BUREAU}
        lectureSeule={lectureSeule}
        onSelectReservation={setResaSelectionnee}
      />
      <ReservationRecapDialog
        reservation={resaSelectionnee}
        lectureSeule={lectureSeule}
        onOpenChange={(open) => !open && setResaSelectionnee(null)}
        onNotesSaved={handleNotesSaved}
        onSupprimee={() => {
          if (!resaSelectionnee) return;
          onReservationSupprimee(resaSelectionnee.villaId, resaSelectionnee.id);
          setResaSelectionnee(null);
        }}
      />
    </>
  );
}

function debutDuJour(d: Date): Date {
  const copie = new Date(d);
  copie.setHours(0, 0, 0, 0);
  return copie;
}

function libelleJourCourt(d: Date): string {
  const jour = format(d, "EEE", { locale: fr }).replace(".", "");
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)}.`;
}

function libelleMois(d: Date): string {
  const mois = format(d, "MMMM", { locale: fr });
  return mois.charAt(0).toUpperCase() + mois.slice(1);
}

// Grille villas × jours (logements en lignes, colonne fixe à gauche ; dates en colonnes avec
// défilement horizontal), mise en forme SuperHote v2.
function TarificationGrid({
  villas,
  dims,
  lectureSeule,
  onSelectReservation,
}: {
  villas: TarificationVilla[];
  dims: Dims;
  lectureSeule: boolean;
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const { col: COL_WIDTH, sidebar: SIDEBAR_WIDTH, row: ROW_HEIGHT, headerMonth: HEADER_MONTH_HEIGHT, headerDays: HEADER_DAYS_HEIGHT, detailRow: DETAIL_ROW_HEIGHT, compact } = dims;
  const dateList = useMemo(() => {
    const debut = addDays(debutDuJour(new Date()), -JOURS_PASSES_PLANNING);
    return Array.from({ length: CALENDAR_DAYS + JOURS_PASSES_PLANNING }, (_, i) => addDays(debut, i));
  }, []);
  const dateStrings = useMemo(() => dateList.map((d) => format(d, "yyyy-MM-dd")), [dateList]);
  const aujourdhui = dateStrings[JOURS_PASSES_PLANNING];

  const moisGroupes = useMemo(() => {
    const groupes: { key: string; label: string; startIndex: number }[] = [];
    dateList.forEach((d, i) => {
      const key = format(d, "yyyy-MM");
      if (groupes[groupes.length - 1]?.key !== key) groupes.push({ key, label: format(d, "MMMM yyyy", { locale: fr }), startIndex: i });
    });
    return groupes;
  }, [dateList]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [ouvertes, setOuvertes] = useState<Set<string>>(() => new Set());
  const toutOuvert = villas.length > 0 && villas.every((v) => ouvertes.has(v.id));
  function basculer(villaId: string) {
    setOuvertes((prev) => {
      const next = new Set(prev);
      if (next.has(villaId)) next.delete(villaId);
      else next.add(villaId);
      return next;
    });
  }
  function toutBasculer() {
    setOuvertes(toutOuvert ? new Set() : new Set(villas.map((v) => v.id)));
  }
  const [premierIndexVisible, setPremierIndexVisible] = useState(0);
  // Mois affiché en grand dans l'en-tête : celui du premier jour visible à l'écran (suit le
  // défilement, comme "Octobre 2026" sur SuperHote).
  const dateEnTete = dateList[Math.min(Math.max(premierIndexVisible, 0), dateList.length - 1)];

  function scroll(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }
  function allerAuMois(key: string) {
    const mois = moisGroupes.find((m) => m.key === key);
    if (mois) scrollRef.current?.scrollTo({ left: mois.startIndex * COL_WIDTH, behavior: "smooth" });
  }

  // Position du trait rouge "maintenant" : dans la colonne d'aujourd'hui, à l'heure courante.
  // Calculée seulement dans le navigateur (heure locale de l'utilisateur, pas celle du serveur)
  // et rafraîchie toutes les 5 minutes.
  const [positionMaintenant, setPositionMaintenant] = useState<number | null>(null);
  useEffect(() => {
    function maj() {
      const maintenant = new Date();
      const fractionJour = (maintenant.getHours() * 60 + maintenant.getMinutes()) / (24 * 60);
      setPositionMaintenant((JOURS_PASSES_PLANNING + fractionJour) * COL_WIDTH);
    }
    maj();
    const timer = setInterval(maj, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [COL_WIDTH]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" })}>
          Aujourd&apos;hui
        </Button>
        <span className="text-sm font-medium">{compact ? "Aller à" : "Allez à"}</span>
        <Select value={format(dateEnTete, "yyyy-MM")} onValueChange={allerAuMois}>
          <SelectTrigger className={compact ? "w-40 flex-1" : "w-48"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {moisGroupes.map((m) => (
              <SelectItem key={m.key} value={m.key} className="capitalize">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex w-full flex-wrap items-center gap-3 text-xs text-muted-foreground md:ml-auto md:w-auto">
          {(["airbnb", "booking", "direct"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <CanalDot source={key} size="xs" />
              {SOURCE_META[key].label}
            </span>
          ))}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden rounded-xl py-0">
        <div className="flex">
          <div className="shrink-0 border-r bg-card" style={{ width: SIDEBAR_WIDTH }}>
            <div
              className={`flex flex-col justify-center border-b ${compact ? "gap-1.5 px-2" : "gap-3 px-4"}`}
              style={{ height: HEADER_MONTH_HEIGHT + HEADER_DAYS_HEIGHT }}
            >
              <span className={`font-semibold ${compact ? "text-xs leading-tight" : "text-sm"}`}>
                {villas.length} hébergement{villas.length > 1 ? "s" : ""}
              </span>
              {lectureSeule ? null : (
              <button
                type="button"
                onClick={toutBasculer}
                title={toutOuvert ? "Replier tous les hébergements" : "Déplier tous les hébergements"}
                aria-label={toutOuvert ? "Replier tous les hébergements" : "Déplier tous les hébergements"}
                className={`flex items-center justify-center rounded-lg border bg-background hover:bg-muted ${compact ? "h-8 w-10" : "h-9 w-12"}`}
              >
                {toutOuvert ? <ChevronUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              </button>
              )}
            </div>
            {villas.map((v) => {
              const ouverte = ouvertes.has(v.id);
              return (
                <div key={v.id}>
                  {/* Toute la ligne déplie/replie les détails de la villa (prix, nuits min/max,
                      arrivées/départs bloqués), comme sur SuperHote — plus de lien vers la fiche. */}
                  <button
                    type="button"
                    onClick={lectureSeule ? undefined : () => basculer(v.id)}
                    aria-expanded={lectureSeule ? undefined : ouverte}
                    className={`flex w-full items-center border-b text-left transition-colors ${lectureSeule ? "cursor-default" : "hover:bg-muted/50"} ${compact ? "gap-1 px-2" : "gap-3 px-4"}`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {compact ? null : v.photoUrl ? (
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
                        <Image src={v.photoUrl} alt="" fill sizes="36px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className={`min-w-0 flex-1 font-semibold ${compact ? "line-clamp-2 text-xs leading-tight" : "truncate text-sm"}`}>{v.nom}</span>
                    {/* Prix PriceLabs indisponibles : petit signal dans la colonne des villas plutôt
                        qu'un texte dans la ligne, qui passait sous les barres de réservation. */}
                    {v.error ? (
                      <span title="Prix temporairement indisponibles" aria-label="Prix temporairement indisponibles">
                        <AlertTriangle className={`shrink-0 text-amber-500 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                      </span>
                    ) : null}
                    {lectureSeule ? null : (
                      <ChevronDown className={`shrink-0 text-muted-foreground transition-transform ${compact ? "h-3.5 w-3.5" : "h-4 w-4"} ${ouverte ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  {ouverte
                    ? LIGNES_DETAIL.map((ligne) => (
                        <div
                          key={ligne.key}
                          className={`flex items-center gap-1.5 border-b bg-muted/40 text-muted-foreground ${compact ? "px-2 text-[11px] leading-tight" : "px-4 text-sm"}`}
                          style={{ height: DETAIL_ROW_HEIGHT }}
                        >
                          <span className={compact ? "line-clamp-2" : "truncate"}>{ligne.label}</span>
                          {ligne.aide && !compact ? (
                            <span title={ligne.aide} aria-label={ligne.aide} className="shrink-0">
                              <Info className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                        </div>
                      ))
                    : null}
                </div>
              );
            })}
          </div>

          <div className="relative min-w-0 flex-1">
            <div className={`pointer-events-none absolute inset-x-0 top-0 z-30 items-center justify-between px-3 ${compact ? "hidden" : "flex"}`} style={{ height: HEADER_MONTH_HEIGHT }}>
              <button
                type="button"
                aria-label="Semaine précédente"
                onClick={() => scroll(-COL_WIDTH * 7)}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border bg-background shadow-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Semaine suivante"
                onClick={() => scroll(COL_WIDTH * 7)}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border bg-background shadow-sm hover:bg-muted"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className={`pointer-events-none absolute top-0 z-30 flex flex-col justify-center leading-tight ${compact ? "left-2" : "left-16"}`} style={{ height: HEADER_MONTH_HEIGHT }}>
              <span className={`font-bold ${compact ? "text-base" : "text-lg"}`} style={{ color: "var(--planning-today)" }}>
                {libelleMois(dateEnTete)}
              </span>
              <span className="text-xs text-muted-foreground">{format(dateEnTete, "yyyy")}</span>
            </div>

            <div
              ref={scrollRef}
              className="overflow-x-auto"
              onScroll={(e) => setPremierIndexVisible(Math.round(e.currentTarget.scrollLeft / COL_WIDTH))}
            >
              <div style={{ width: COL_WIDTH * dateList.length }}>
                <div style={{ height: HEADER_MONTH_HEIGHT }} />
                <div className="flex border-b" style={{ height: HEADER_DAYS_HEIGHT }}>
                  {dateList.map((d, i) => {
                    const estAujourdhui = dateStrings[i] === aujourdhui;
                    const weekEnd = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={dateStrings[i]} className="shrink-0 p-0.5 pb-1.5" style={{ width: COL_WIDTH }}>
                        <div
                          className={`flex h-full flex-col items-center justify-center rounded-md leading-none ${
                            estAujourdhui ? "text-white" : weekEnd ? "bg-muted" : ""
                          }`}
                          style={estAujourdhui ? { backgroundColor: "var(--planning-today)" } : undefined}
                        >
                          <span className={`${compact ? "text-[10px]" : "text-xs"} ${estAujourdhui ? "text-white/90" : "text-muted-foreground"}`}>{libelleJourCourt(d)}</span>
                          <span className={`mt-1 font-semibold tabular-nums ${compact ? "text-base" : "text-lg"}`}>{format(d, "dd")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="relative">
                  {villas.map((v) => (
                    <div key={v.id}>
                      <VillaCalendarRow
                        villa={v}
                        dateStrings={dateStrings}
                        aujourdhui={aujourdhui}
                        dims={dims}
                        onSelectReservation={onSelectReservation}
                      />
                      {ouvertes.has(v.id) ? <VillaDetailRows villa={v} dateStrings={dateStrings} aujourdhui={aujourdhui} dims={dims} /> : null}
                    </div>
                  ))}
                  {positionMaintenant !== null ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5"
                      style={{ left: positionMaintenant, backgroundColor: "var(--planning-today)" }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function VillaCalendarRow({
  villa,
  dateStrings,
  aujourdhui,
  dims,
  onSelectReservation,
}: {
  villa: TarificationVilla;
  dateStrings: string[];
  aujourdhui: string;
  dims: Dims;
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const { col: COL_WIDTH, row: ROW_HEIGHT, compact } = dims;
  const largeurTotale = COL_WIDTH * dateStrings.length;
  const dayByDate = new Map(villa.days.map((d) => [d.date, d]));
  const resas = reservationsVisibles(villa.reservations, dateStrings);
  // Jours couverts par une barre : pas de prix ni de hachures dessous.
  const couverts = new Set(resas.flatMap((r) => dateStrings.filter((d) => d >= r.checkIn && d < r.checkOut)));

  return (
    <div className="relative border-b" style={{ height: ROW_HEIGHT, width: largeurTotale }}>
      <div className="absolute inset-0 flex">
        {dateStrings.map((date) => {
          const passe = date < aujourdhui;
          const jour = dayByDate.get(date);
          const couvert = couverts.has(date);
          const bloque = !passe && !couvert && !villa.error && (!jour || jour.unbookable || jour.price == null);
          return (
            <div
              key={date}
              className={`flex shrink-0 items-center justify-end border-r tabular-nums ${compact ? "px-1 text-xs" : "px-2 text-sm"}`}
              style={{
                width: COL_WIDTH,
                backgroundImage: bloque
                  ? "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 7px)"
                  : undefined,
              }}
            >
              {!passe && !couvert && !bloque && jour?.price != null ? formatPrixCompact(jour.price, villa.currency) : null}
            </div>
          );
        })}
      </div>

      {resas.map((r) => {
        const { left, width } = barPosition(r, dateStrings, COL_WIDTH);
        const termine = r.checkOut <= aujourdhui;
        const canal = normaliseCanal(r.canal);
        return (
          <button
            key={r.id}
            type="button"
            title={`${r.guestName} · ${format(parseISO(r.checkIn), "d MMM", { locale: fr })} → ${format(parseISO(r.checkOut), "d MMM", { locale: fr })}`}
            onClick={() => onSelectReservation({ villaId: villa.id, villaNom: villa.nom, ...r })}
            className={`absolute top-1.5 bottom-1.5 z-10 flex min-w-0 items-center rounded-lg border text-left font-semibold ${compact ? "px-1 text-xs" : "px-1.5 text-sm"} transition-[filter] hover:brightness-95 dark:hover:brightness-125 ${
              termine ? "opacity-50" : ""
            }`}
            style={{ left, width, ...canalPlanningStyle(canal) }}
          >
            <span className={`sticky left-1.5 flex min-w-0 items-center ${compact ? "gap-1" : "gap-2"}`}>
              <CanalDot canal={r.canal} size={compact ? "md" : "lg"} />
              <span className="truncate">{r.guestName}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

type DetailJour = {
  date: string;
  price: number | null;
  minStay: number | null;
  maxStay: number | null;
  arriveeBloquee: boolean;
  departBloque: boolean;
};

// Cache côté navigateur des calendriers Beds24 déjà chargés : replier puis redéplier une villa ne
// refait pas l'appel (Beds24 compte ses appels API).
const cacheDetails = new Map<string, DetailJour[]>();

// Détails jour par jour d'une villa dépliée, lus dans Beds24 (là où PriceLabs pousse désormais
// ses prix, et d'où partent les règles vers Airbnb/Booking). Villa pas encore reliée à Beds24 :
// prix PriceLabs seulement, le reste en tiret.
function VillaDetailRows({ villa, dateStrings, aujourdhui, dims }: { villa: TarificationVilla; dateStrings: string[]; aujourdhui: string; dims: Dims }) {
  const { col: COL_WIDTH, detailRow: DETAIL_ROW_HEIGHT, compact } = dims;
  const roomId = villa.beds24RoomId ? Number(villa.beds24RoomId) : null;
  const from = dateStrings[0];
  const to = dateStrings[dateStrings.length - 1];
  const cleCache = roomId ? `${roomId}:${from}:${to}` : null;
  const [details, setDetails] = useState<DetailJour[] | null>(() => (cleCache ? (cacheDetails.get(cleCache) ?? null) : null));
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !cleCache || cacheDetails.has(cleCache)) return;
    let annule = false;
    fetch(`/api/beds24/calendrier?roomId=${roomId}&from=${from}&to=${to}`)
      .then(async (res) => {
        const body = (await res.json()) as { days?: DetailJour[]; error?: string };
        if (!res.ok || !body.days) throw new Error(body.error ?? "Calendrier Beds24 indisponible.");
        cacheDetails.set(cleCache, body.days);
        if (!annule) setDetails(body.days);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof Error ? e.message : "Calendrier Beds24 indisponible.");
      });
    return () => {
      annule = true;
    };
  }, [roomId, cleCache, from, to]);

  const parDate = new Map((details ?? []).map((d) => [d.date, d]));
  const prixPricelabs = new Map(villa.days.map((d) => [d.date, d.price]));
  const chargement = Boolean(roomId) && !details && !erreur;
  const message = !roomId ? "Villa pas encore reliée à Beds24 : prix PriceLabs uniquement." : erreur;

  function valeur(ligne: (typeof LIGNES_DETAIL)[number]["key"], date: string): string {
    const d = parDate.get(date);
    switch (ligne) {
      case "prix": {
        const prix = d?.price ?? prixPricelabs.get(date) ?? null;
        return prix != null ? formatPrixCompact(prix, villa.currency ?? "EUR") : "";
      }
      case "min":
        return d?.minStay != null ? String(d.minStay) : roomId ? "" : "—";
      case "max":
        return d?.maxStay != null ? String(d.maxStay) : roomId ? "" : "—";
      case "arrivee":
        return d ? (d.arriveeBloquee ? "Oui" : "Non") : roomId ? "" : "—";
      case "depart":
        return d ? (d.departBloque ? "Oui" : "Non") : roomId ? "" : "—";
    }
  }

  return (
    <div className="relative bg-muted/40">
      {LIGNES_DETAIL.map((ligne) => (
        <div key={ligne.key} className="flex border-b" style={{ height: DETAIL_ROW_HEIGHT, width: COL_WIDTH * dateStrings.length }}>
          {dateStrings.map((date) => {
            const texte = valeur(ligne.key, date);
            const bloque = texte === "Oui";
            return (
              <div
                key={date}
                className={`flex shrink-0 items-center justify-end border-r tabular-nums ${compact ? "px-1 text-xs" : "px-2 text-sm"} ${
                  date < aujourdhui ? "text-muted-foreground" : ""
                } ${bloque ? "font-semibold text-destructive" : ""}`}
                style={{ width: COL_WIDTH }}
              >
                {texte}
              </div>
            );
          })}
        </div>
      ))}
      {chargement || message ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center" style={{ height: DETAIL_ROW_HEIGHT }}>
          <span className="sticky left-3 rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
            {chargement ? "Chargement des détails Beds24…" : message}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// Barre de séjour : du milieu de la case d'arrivée au milieu de la case de départ (arrivée
// l'après-midi, départ le matin), comme sur SuperHote. Un séjour commencé avant la fenêtre
// affichée part du bord gauche ; un séjour qui la dépasse va jusqu'au bord droit.
function barPosition(r: TarificationReservation, dateStrings: string[], COL_WIDTH: number): { left: number; width: number } {
  const debutIdx = dateStrings.indexOf(r.checkIn);
  const finIdx = dateStrings.indexOf(r.checkOut);
  const gauche = debutIdx === -1 ? 0 : debutIdx * COL_WIDTH + COL_WIDTH / 2 + 2;
  const droite = finIdx === -1 ? dateStrings.length * COL_WIDTH : finIdx * COL_WIDTH + COL_WIDTH / 2 - 2;
  return { left: gauche, width: Math.max(droite - gauche, COL_WIDTH / 2) };
}

function reservationsVisibles(reservations: TarificationReservation[], dateStrings: string[]): TarificationReservation[] {
  const premiereDate = dateStrings[0];
  const derniereDate = dateStrings[dateStrings.length - 1];
  return reservations.filter((r) => r.checkIn <= derniereDate && r.checkOut > premiereDate);
}

function ReservationRecapDialog({
  reservation,
  lectureSeule,
  onOpenChange,
  onNotesSaved,
  onSupprimee,
}: {
  reservation: ReservationSelectionnee | null;
  lectureSeule: boolean;
  onOpenChange: (open: boolean) => void;
  onNotesSaved: (notes: string) => void;
  onSupprimee: () => void;
}) {
  const nuits = reservation ? differenceInCalendarDays(parseISO(reservation.checkOut), parseISO(reservation.checkIn)) : 0;

  return (
    <Dialog open={reservation !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {reservation ? (
          <>
            <DialogHeader>
              <DialogTitle>{reservation.guestName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Logement</span>
                <span className="font-medium">{reservation.villaNom}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Séjour</span>
                <span className="font-medium">
                  {format(parseISO(reservation.checkIn), "d MMM yyyy", { locale: fr })} →{" "}
                  {format(parseISO(reservation.checkOut), "d MMM yyyy", { locale: fr })} ({nuits} nuit{nuits > 1 ? "s" : ""})
                </span>
              </div>
              {reservation.enCours ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statut</span>
                  <span className="font-medium text-green-600 dark:text-green-400">Séjour en cours</span>
                </div>
              ) : null}
              {reservation.guestsCount != null ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voyageurs</span>
                  <span className="font-medium">{reservation.guestsCount}</span>
                </div>
              ) : null}
              {reservation.canal ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Canal</span>
                  <CanalBadge canal={reservation.canal} />
                </div>
              ) : null}
              {reservation.montant != null ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant total</span>
                  <span className="font-medium">{formatMontant(reservation.montant, reservation.devise)}</span>
                </div>
              ) : null}
              {reservation.montantPaye != null ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Déjà payé</span>
                  <span className="font-medium">{formatMontant(reservation.montantPaye, reservation.devise)}</span>
                </div>
              ) : null}
              {reservation.guestPhone ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Téléphone</span>
                  <PhoneLink phone={reservation.guestPhone} />
                </div>
              ) : null}
              {reservation.ajouteeLe ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Ajoutée</span>
                  <span className="text-right font-medium">
                    {formatHeureMaroc(reservation.ajouteeLe)}
                    {reservation.ajouteePar ? (
                      <span className="block text-xs font-normal text-muted-foreground">par {reservation.ajouteePar}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {lectureSeule ? null : (
              <>
              {reservation.beds24Echec ? (
                <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
                  Attention : la fermeture des dates sur Beds24 a échoué à la création. Airbnb et Booking.com peuvent
                  encore être ouverts : ouvre la réservation complète et clique sur « Refermer les dates ».
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Note</span>
                {reservation.notes ? (
                  <span className="flex items-start gap-1.5 text-right font-medium">
                    {reservation.notes}
                    <EditNotesButton reservationId={reservation.id} notes={reservation.notes} onSaved={onNotesSaved} />
                  </span>
                ) : (
                  <EditNotesButton reservationId={reservation.id} notes={null} variant="add" onSaved={onNotesSaved} />
                )}
              </div>
              </>
              )}
            </div>
            {lectureSeule ? null : (
            <>
            <Button asChild className="w-full">
              <Link href={`/reservations/${reservation.id}`}>Voir la réservation complète</Link>
            </Button>
            {/* Réservation créée dans l'app : la supprimer rouvre aussi les dates sur Beds24, donc
                Airbnb et Booking.com (voir deleteReservation). Les réservations importées
                (Airbnb, Booking, Superhote) se gèrent depuis leur plateforme. */}
            {reservation.source === "manuel" || (reservation.source === "beds24" && ["direct", "bloque"].includes(normaliseCanal(reservation.canal))) ? (
              <div className="flex justify-center">
                <ConfirmDeleteButton
                  label="Supprimer et rouvrir les dates"
                  title="Supprimer cette réservation ?"
                  description="La réservation est annulée dans Beds24 et supprimée de l'app : les dates sont rouvertes sur Airbnb et Booking.com. Le ménage et la cuisine affectés sont supprimés avec elle."
                  action={async () => {
                    await deleteReservation(reservation.id);
                    onSupprimee();
                  }}
                />
              </div>
            ) : null}
            </>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function currencySymbole(code: string | null): string {
  if (code === "EUR") return "€";
  if (code === "USD") return "$";
  if (code === "GBP") return "£";
  return code ?? "";
}

function formatPrix(montant: number, currency: string | null): string {
  return `${Math.round(montant)} ${currencySymbole(currency)}`.trim();
}

function formatPrixCompact(montant: number, currency: string | null): string {
  return `${Math.round(montant)}${currencySymbole(currency)}`;
}

function formatMontant(montant: number, devise: string): string {
  return `${montant.toFixed(2).replace(".", ",")} ${currencySymbole(devise) || devise}`.trim();
}
