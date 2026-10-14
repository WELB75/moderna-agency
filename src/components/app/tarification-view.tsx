"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, formatDistanceToNow, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, ChevronDown, ChevronsUpDown, ChevronUp, Info, RefreshCw, Search } from "lucide-react";
import { PhoneLink } from "@/components/app/phone-link";
import { EditNotesButton } from "@/components/app/edit-notes-button";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteReservation } from "@/lib/actions/reservations";
import { CanalBadge, CanalDot } from "@/components/app/canal-badge";
import { canalBarStyle, canalPlanningStyle, normaliseCanal, SOURCE_META } from "@/lib/canal";
import type { TarificationReservation, TarificationVilla } from "@/lib/pricelabs/sync";

export function TarificationView({ initialVillas }: { initialVillas: TarificationVilla[] }) {
  const [villasTarifs, setVillasTarifs] = useState(initialVillas);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const villasFiltrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return villasTarifs;
    return villasTarifs.filter((v) => v.nom.toLowerCase().includes(q) || v.numero.toLowerCase().includes(q));
  }, [villasTarifs, search]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un logement..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
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

      <DevisRapide villas={villasTarifs} />

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
        <TarificationCalendrier villas={villasFiltrees} onNotesUpdated={handleNotesUpdated} onReservationSupprimee={handleReservationSupprimee} />
      )}
    </div>
  );
}

type DevisResultat =
  | { statut: "invalide"; message: string }
  | { statut: "indisponible" }
  | { statut: "disponible"; nuits: number; total: number };

// Même pastille verte/rouge que la carte du personnel (personnel-carte.tsx) — Kamel, 2026-09-26 :
// "c'est possible aussi d'avoir quand c'est deja pris/réservé ou pas, ce sera encore plus simple".
function DisponibiliteDot({ statut, label }: { statut: "disponible" | "indisponible" | "inconnu"; label: string }) {
  const couleur = statut === "disponible" ? "bg-green-500" : statut === "indisponible" ? "bg-red-500" : "bg-muted-foreground/40";
  const texte =
    statut === "disponible"
      ? "text-green-600 dark:text-green-400"
      : statut === "indisponible"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${couleur}`} />
      <span className={texte}>{label}</span>
    </span>
  );
}

// Sélection d'une villa → prix du jour affiché immédiatement (pas besoin d'ouvrir la fiche
// villa) + un devis optionnel sur une plage de dates. Le prix PriceLabs est utilisé tel quel,
// SANS ajouter de marge : la commission Airbnb/Booking (~19%) est déjà intégrée dedans en amont
// par Kamel au moment de régler le prix net voulu dans PriceLabs (ex. 280€ net → 333€ affiché).
// Rajouter 19% ici doublerait la commission — comparé à une vraie réservation Airbnb (Villa
// Tania, 3 nuits x 333€ = 999€), c'est bien ce total brut qui correspond, pas 999 + 19%.
// Kamel, 2026-09-26, après une capture d'écran Airbnb montrant l'écart : "je crois qu'il faut
// les retirer".
function DevisRapide({ villas }: { villas: TarificationVilla[] }) {
  const [villaId, setVillaId] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");

  const villa = villas.find((v) => v.id === villaId) ?? null;

  const prixCeSoir = useMemo(() => {
    if (!villa) return null;
    const aujourdhui = format(new Date(), "yyyy-MM-dd");
    return villa.days.find((d) => d.date === aujourdhui) ?? null;
  }, [villa]);

  const devis = useMemo<DevisResultat | null>(() => {
    if (!villa || !debut || !fin) return null;
    const debutDate = parseISO(debut);
    const finDate = parseISO(fin);
    if (finDate <= debutDate) return { statut: "invalide", message: "La date de fin doit être après la date de début." };

    const nuits: number[] = [];
    let manquantes = 0;
    let indisponibles = 0;
    for (let cursor = debutDate; cursor < finDate; cursor = addDays(cursor, 1)) {
      const jour = villa.days.find((d) => d.date === format(cursor, "yyyy-MM-dd"));
      if (!jour) manquantes++;
      else if (jour.unbookable || jour.price == null) indisponibles++;
      else nuits.push(jour.price);
    }
    if (manquantes > 0) return { statut: "invalide", message: "Période hors du calendrier de prix disponible (1 an)." };
    // Une seule nuit déjà prise suffit à rendre le séjour demandé impossible tel quel — pas la
    // peine de détailler combien, "elle" a juste besoin de savoir si ça passe ou pas.
    if (indisponibles > 0) return { statut: "indisponible" };

    return { statut: "disponible", nuits: nuits.length, total: nuits.reduce((s, p) => s + p, 0) };
  }, [villa, debut, fin]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Devis rapide</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Logement</Label>
            <Select value={villaId} onValueChange={setVillaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir un logement" />
              </SelectTrigger>
              <SelectContent>
                {villas.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="devis-debut">Du</Label>
            <Input id="devis-debut" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="devis-fin">Au</Label>
            <Input id="devis-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>

        {villa ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <DisponibiliteDot
              statut={!prixCeSoir ? "inconnu" : prixCeSoir.unbookable || prixCeSoir.price == null ? "indisponible" : "disponible"}
              label={
                !prixCeSoir
                  ? "Pas de prix connu pour ce soir"
                  : prixCeSoir.unbookable || prixCeSoir.price == null
                    ? "Réservé ce soir"
                    : "Disponible ce soir"
              }
            />
            {prixCeSoir && !prixCeSoir.unbookable && prixCeSoir.price != null ? (
              <span className="text-sm font-semibold">{formatPrix(prixCeSoir.price, villa.currency)}</span>
            ) : null}
          </div>
        ) : null}

        {devis ? (
          devis.statut === "invalide" ? (
            <p className="text-sm text-destructive">{devis.message}</p>
          ) : devis.statut === "indisponible" ? (
            <DisponibiliteDot statut="indisponible" label="Déjà réservé sur cette période" />
          ) : (
            <div className="space-y-2">
              <DisponibiliteDot statut="disponible" label="Disponible sur toute la période" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{devis.nuits} nuit(s)</span>
                <span className="text-base font-semibold">{formatPrix(devis.total, villa!.currency)}</span>
              </div>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

// Vue planning calquée sur SuperHote v2 (captures envoyées le 2026-10-13 : "le calendrier doit
// ressembler à ça") : colonnes larges avec jour de la semaine + grand numéro, week-ends grisés,
// aujourd'hui en rouge avec un trait vertical, prix "350€" dans les cases libres, et barres de
// réservation qui démarrent au milieu de la case d'arrivée et s'arrêtent au milieu de la case de
// départ, colorées et marquées du logo de leur canal (Airbnb / Booking.com / Direct).
const COL_WIDTH = 64;
const SIDEBAR_WIDTH = 260;
const ROW_HEIGHT = 64;
const HEADER_MONTH_HEIGHT = 56;
const HEADER_DAYS_HEIGHT = 64;
const CALENDAR_DAYS = 365;
const DETAIL_ROW_HEIGHT = 44;

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
  onNotesUpdated,
  onReservationSupprimee,
}: {
  villas: TarificationVilla[];
  onNotesUpdated: (villaId: string, reservationId: string, notes: string) => void;
  onReservationSupprimee: (villaId: string, reservationId: string) => void;
}) {
  const [resaSelectionnee, setResaSelectionnee] = useState<ReservationSelectionnee | null>(null);

  function handleNotesSaved(notes: string) {
    if (!resaSelectionnee) return;
    setResaSelectionnee({ ...resaSelectionnee, notes: notes || null });
    onNotesUpdated(resaSelectionnee.villaId, resaSelectionnee.id, notes);
  }

  return (
    <>
      <div className="hidden md:block">
        <TarificationDesktopGrid villas={villas} onSelectReservation={setResaSelectionnee} />
      </div>
      <div className="space-y-3 md:hidden">
        <TarificationMobileList villas={villas} onSelectReservation={setResaSelectionnee} />
      </div>
      <ReservationRecapDialog
        reservation={resaSelectionnee}
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
function TarificationDesktopGrid({
  villas,
  onSelectReservation,
}: {
  villas: TarificationVilla[];
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
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
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" })}>
          Aujourd&apos;hui
        </Button>
        <span className="text-sm font-medium">Allez à</span>
        <Select value={format(dateEnTete, "yyyy-MM")} onValueChange={allerAuMois}>
          <SelectTrigger className="w-48">
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
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
              className="flex flex-col justify-center gap-3 border-b px-4"
              style={{ height: HEADER_MONTH_HEIGHT + HEADER_DAYS_HEIGHT }}
            >
              <span className="text-sm font-semibold">
                {villas.length} hébergement{villas.length > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={toutBasculer}
                title={toutOuvert ? "Replier tous les hébergements" : "Déplier tous les hébergements"}
                aria-label={toutOuvert ? "Replier tous les hébergements" : "Déplier tous les hébergements"}
                className="flex h-9 w-12 items-center justify-center rounded-lg border bg-background hover:bg-muted"
              >
                {toutOuvert ? <ChevronUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              </button>
            </div>
            {villas.map((v) => {
              const ouverte = ouvertes.has(v.id);
              return (
                <div key={v.id}>
                  {/* Toute la ligne déplie/replie les détails de la villa (prix, nuits min/max,
                      arrivées/départs bloqués), comme sur SuperHote — plus de lien vers la fiche. */}
                  <button
                    type="button"
                    onClick={() => basculer(v.id)}
                    aria-expanded={ouverte}
                    className="flex w-full items-center gap-3 border-b px-4 text-left transition-colors hover:bg-muted/50"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {v.photoUrl ? (
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
                        <Image src={v.photoUrl} alt="" fill sizes="36px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{v.nom}</span>
                    {/* Prix PriceLabs indisponibles : petit signal dans la colonne des villas plutôt
                        qu'un texte dans la ligne, qui passait sous les barres de réservation. */}
                    {v.error ? (
                      <span title="Prix temporairement indisponibles" aria-label="Prix temporairement indisponibles">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      </span>
                    ) : null}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${ouverte ? "rotate-180" : ""}`} />
                  </button>
                  {ouverte
                    ? LIGNES_DETAIL.map((ligne) => (
                        <div
                          key={ligne.key}
                          className="flex items-center gap-1.5 border-b bg-muted/40 px-4 text-sm text-muted-foreground"
                          style={{ height: DETAIL_ROW_HEIGHT }}
                        >
                          <span className="truncate">{ligne.label}</span>
                          {ligne.aide ? (
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
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3" style={{ height: HEADER_MONTH_HEIGHT }}>
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
            <div className="pointer-events-none absolute top-0 left-16 z-30 flex flex-col justify-center leading-tight" style={{ height: HEADER_MONTH_HEIGHT }}>
              <span className="text-lg font-bold" style={{ color: "var(--planning-today)" }}>
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
                          <span className={`text-xs ${estAujourdhui ? "text-white/90" : "text-muted-foreground"}`}>{libelleJourCourt(d)}</span>
                          <span className="mt-1 text-lg font-semibold tabular-nums">{format(d, "dd")}</span>
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
                        onSelectReservation={onSelectReservation}
                      />
                      {ouvertes.has(v.id) ? <VillaDetailRows villa={v} dateStrings={dateStrings} aujourdhui={aujourdhui} /> : null}
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
  onSelectReservation,
}: {
  villa: TarificationVilla;
  dateStrings: string[];
  aujourdhui: string;
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
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
              className="flex shrink-0 items-center justify-end border-r px-2 text-sm tabular-nums"
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
        const { left, width } = barPosition(r, dateStrings);
        const termine = r.checkOut <= aujourdhui;
        const canal = normaliseCanal(r.canal);
        return (
          <button
            key={r.id}
            type="button"
            title={`${r.guestName} · ${format(parseISO(r.checkIn), "d MMM", { locale: fr })} → ${format(parseISO(r.checkOut), "d MMM", { locale: fr })}`}
            onClick={() => onSelectReservation({ villaId: villa.id, villaNom: villa.nom, ...r })}
            className={`absolute top-1.5 bottom-1.5 z-10 flex min-w-0 items-center rounded-lg border px-1.5 text-left text-sm font-semibold transition-[filter] hover:brightness-95 dark:hover:brightness-125 ${
              termine ? "opacity-50" : ""
            }`}
            style={{ left, width, ...canalPlanningStyle(canal) }}
          >
            <span className="sticky left-1.5 flex min-w-0 items-center gap-2">
              <CanalDot canal={r.canal} size="lg" />
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
function VillaDetailRows({ villa, dateStrings, aujourdhui }: { villa: TarificationVilla; dateStrings: string[]; aujourdhui: string }) {
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
                className={`flex shrink-0 items-center justify-end border-r px-2 text-sm tabular-nums ${
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
function barPosition(r: TarificationReservation, dateStrings: string[]): { left: number; width: number } {
  const debutIdx = dateStrings.indexOf(r.checkIn);
  const finIdx = dateStrings.indexOf(r.checkOut);
  const gauche = debutIdx === -1 ? 0 : debutIdx * COL_WIDTH + COL_WIDTH / 2 + 2;
  const droite = finIdx === -1 ? dateStrings.length * COL_WIDTH : finIdx * COL_WIDTH + COL_WIDTH / 2 - 2;
  return { left: gauche, width: Math.max(droite - gauche, COL_WIDTH / 2) };
}

// Vue mois façon appli Airbnb (calendrier d'une seule annonce, semaines en lignes de 7 jours,
// nom du mois qui reste affiché pendant qu'on descend) plutôt qu'une bande de jours par logement
// — Kamel, après capture d'écran de l'appli Airbnb : "la version mobile je veux comme airbnb, vue
// au mois directement". Un sélecteur choisit le logement affiché (comme Airbnb, une annonce à la
// fois), le calendrier suit en dessous.
function TarificationMobileList({
  villas,
  onSelectReservation,
}: {
  villas: TarificationVilla[];
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const [villaId, setVillaId] = useState(villas[0]?.id ?? "");
  const villa = villas.find((v) => v.id === villaId) ?? villas[0] ?? null;
  if (!villa) return null;

  return (
    <div className="space-y-3">
      <Select value={villa.id} onValueChange={setVillaId}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {villas.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <VillaMonthCalendar villa={villa} onSelectReservation={onSelectReservation} />
    </div>
  );
}

// Semaines lundi→dimanche (convention française, comme sur la capture Airbnb "L M M J V S D") :
// les jours avant aujourd'hui ou après la fin du calendrier de prix chargé (villa.days) restent
// des cases vides plutôt que d'inventer une date sans prix.
function buildWeeks(villa: TarificationVilla): (string | null)[][] {
  if (villa.days.length === 0) return [];
  const premiereDate = villa.days[0].date;
  const derniereDate = villa.days[villa.days.length - 1].date;
  const lundi = startOfWeek(parseISO(premiereDate), { weekStartsOn: 1 });
  const fin = parseISO(derniereDate);

  const semaines: (string | null)[][] = [];
  for (let cursor = lundi; cursor <= fin; cursor = addDays(cursor, 7)) {
    const semaine: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = format(addDays(cursor, i), "yyyy-MM-dd");
      semaine.push(iso >= premiereDate && iso <= derniereDate ? iso : null);
    }
    semaines.push(semaine);
  }
  return semaines;
}

const MOBILE_WEEK_ROW_HEIGHT = 60;

function VillaMonthCalendar({
  villa,
  onSelectReservation,
}: {
  villa: TarificationVilla;
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const semaines = useMemo(() => semainesAvecMois(buildWeeks(villa)), [villa]);
  const dayByDate = useMemo(() => new Map(villa.days.map((d) => [d.date, d])), [villa.days]);
  const aujourdhui = villa.days[0]?.date;

  if (villa.error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">Prix temporairement indisponibles, réessayez plus tard.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-0 overflow-hidden rounded-2xl border">
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-background text-center text-[11px] font-medium text-muted-foreground">
        {["L", "M", "M", "J", "V", "S", "D"].map((jour, i) => (
          <div key={i} className="py-1.5">
            {jour}
          </div>
        ))}
      </div>

      {semaines.map(({ semaine, moisLabel }, semaineIdx) => (
        <div key={semaineIdx}>
          {moisLabel ? (
            <div className="sticky top-[29px] z-10 border-b bg-background px-3 py-2 text-lg font-semibold capitalize">{moisLabel}</div>
          ) : null}
          <div className="relative grid grid-cols-7 border-b" style={{ gridAutoRows: MOBILE_WEEK_ROW_HEIGHT }}>
            {semaine.map((date, i) => {
              if (!date) return <div key={i} className="border-r last:border-r-0" style={{ gridColumn: i + 1, gridRow: 1 }} />;
              const jour = dayByDate.get(date);
              const bloque = !jour || jour.unbookable || jour.price == null;
              return (
                <div
                  key={date}
                  className="flex flex-col items-center gap-1 border-r pt-1.5 text-xs last:border-r-0"
                  style={{
                    gridColumn: i + 1,
                    gridRow: 1,
                    backgroundColor: bloque ? "var(--muted)" : undefined,
                    backgroundImage: bloque
                      ? "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 6px)"
                      : undefined,
                  }}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full font-medium ${
                      date === aujourdhui ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    {format(parseISO(date), "d")}
                  </span>
                  {!bloque ? <span className="text-[11px] text-muted-foreground">{formatPrix(jour!.price!, villa.currency)}</span> : null}
                </div>
              );
            })}

            {/* Volontairement pas toute la hauteur de la case : le numéro du jour (en haut,
                rendu juste au-dessus dans la grille des jours) doit rester visible quoi qu'il
                arrive — Kamel, 2026-09-29, en voyant la barre couvrir le numéro : "laisse les
                jours apparaitre [...] donc la bande violete reduis la comme ça on voit toujours
                les jours aussi quoiqu'il arrive". La barre ne prend que le bas de la case, là où
                le prix se serait affiché pour un jour libre. */}
            {bargsForWeek(semaine, villa.reservations).map(({ start, end, arrondiGauche, arrondiDroite, reservation }) => (
              <button
                key={reservation.id}
                type="button"
                onClick={() => onSelectReservation({ villaId: villa.id, villaNom: villa.nom, ...reservation })}
                className={`relative mb-1 flex h-5 min-w-0 items-center self-end pr-2 text-[11px] font-medium text-foreground active:brightness-95 ${
                  arrondiGauche ? "rounded-l-full ml-1 pl-0.5" : "pl-1"
                } ${arrondiDroite ? "rounded-r-full mr-1" : ""}`}
                style={{
                  gridColumn: `${start} / ${end}`,
                  gridRow: 1,
                  // Pas de border-l ici (barre en pilule) : la teinte + la pastille au début du
                  // séjour suffisent à identifier le canal.
                  ...canalBarStyle(normaliseCanal(reservation.canal), 20),
                }}
              >
                <span className="sticky left-1 flex min-w-0 items-center gap-1">
                  {arrondiGauche ? <CanalDot canal={reservation.canal} size="xs" /> : null}
                  <span className="truncate">
                    {reservation.guestName}
                    {reservation.enCours ? " · En cours" : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Regroupe les semaines avec, pour chacune, le nom du mois à afficher juste au-dessus si elle
// est la première à contenir un jour de ce mois-là (null sinon) — calculé une fois en dehors du
// rendu plutôt qu'avec une variable mutée pendant le .map() de la JSX (le linter React interdit
// cette réassignation "impure" pendant le rendu).
function semainesAvecMois(semaines: (string | null)[][]): { semaine: (string | null)[]; moisLabel: string | null }[] {
  let dernierMoisAffiche = "";
  return semaines.map((semaine) => {
    const premierJourReel = semaine.find((d): d is string => d !== null);
    const moisLabel = premierJourReel ? format(parseISO(premierJourReel), "MMMM yyyy", { locale: fr }) : null;
    const nouveauMois = moisLabel !== null && moisLabel !== dernierMoisAffiche;
    if (moisLabel) dernierMoisAffiche = moisLabel;
    return { semaine, moisLabel: nouveauMois ? moisLabel : null };
  });
}

// Un séjour peut chevaucher plusieurs semaines : chaque ligne de semaine ne dessine que le
// segment de la barre qui tombe dans ses 7 jours, avec un bord arrondi seulement du côté où le
// séjour commence/finit réellement cette semaine-là (sinon coin carré, pour que le regard
// comprenne que ça continue sur la semaine suivante) — même logique que barGridColumns/
// reservationsVisibles pour le desktop, adaptée à une semaine de 7 colonnes au lieu de toute la
// fenêtre affichée.
function bargsForWeek(
  semaine: (string | null)[],
  reservations: TarificationReservation[]
): { start: number; end: number; arrondiGauche: boolean; arrondiDroite: boolean; reservation: TarificationReservation }[] {
  const resultats: { start: number; end: number; arrondiGauche: boolean; arrondiDroite: boolean; reservation: TarificationReservation }[] = [];
  for (const r of reservations) {
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < 7; i++) {
      const d = semaine[i];
      if (d && d >= r.checkIn && d < r.checkOut) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }
    if (startIdx === -1) continue;
    resultats.push({
      start: startIdx + 1,
      end: endIdx + 2,
      arrondiGauche: semaine[startIdx] === r.checkIn,
      arrondiDroite: format(addDays(parseISO(semaine[endIdx]!), 1), "yyyy-MM-dd") === r.checkOut,
      reservation: r,
    });
  }
  return resultats;
}

// Un séjour dont le check-in ET le check-out tombent tous les deux hors de la fenêtre affichée ne
// doit rien dessiner du tout — sans ce filtre, barGridColumns (qui cale sur les bords quand une
// date est introuvable) ferait apparaître à tort une barre collée au bord gauche pour une
// réservation en réalité entièrement future. Peu visible avec les 365 jours du desktop (l'écart
// est rare), mais systématique avec les 45 jours du mobile.
function reservationsVisibles(reservations: TarificationReservation[], dateStrings: string[]): TarificationReservation[] {
  const premiereDate = dateStrings[0];
  const derniereDate = dateStrings[dateStrings.length - 1];
  return reservations.filter((r) => r.checkIn <= derniereDate && r.checkOut > premiereDate);
}

function ReservationRecapDialog({
  reservation,
  onOpenChange,
  onNotesSaved,
  onSupprimee,
}: {
  reservation: ReservationSelectionnee | null;
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
            </div>
            <Button asChild className="w-full">
              <Link href={`/reservations/${reservation.id}`}>Voir la réservation complète</Link>
            </Button>
            {/* Réservation créée dans l'app : la supprimer rouvre aussi les dates sur Beds24, donc
                Airbnb et Booking.com (voir deleteReservation). Les réservations importées
                (Airbnb, Booking, Superhote) se gèrent depuis leur plateforme. */}
            {reservation.source === "manuel" ? (
              <div className="flex justify-center">
                <ConfirmDeleteButton
                  label="Supprimer et rouvrir les dates"
                  title="Supprimer cette réservation ?"
                  description="La réservation est supprimée de l'app et les dates sont rouvertes sur le calendrier Beds24, donc sur Airbnb et Booking.com. Le ménage et la cuisine affectés sont supprimés avec elle."
                  action={async () => {
                    await deleteReservation(reservation.id);
                    onSupprimee();
                  }}
                />
              </div>
            ) : null}
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
