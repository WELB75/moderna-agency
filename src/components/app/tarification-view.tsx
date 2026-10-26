"use client";

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useEstMobile } from "@/lib/use-est-mobile";
import Image from "next/image";
import Link from "@/components/app/link";
import { addDays, differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, ChevronDown, ChevronsUpDown, ChevronUp, ExternalLink, Ban, Info, RefreshCw, Search } from "lucide-react";
import { PhoneLink } from "@/components/app/phone-link";
import { EditNotesButton } from "@/components/app/edit-notes-button";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { toast } from "sonner";
import { annulerReservation, deleteReservation } from "@/lib/actions/reservations";
import { avertissementEncaisse, encaisse, MOTIFS_ANNULATION, reservationsEnChevauchement } from "@/lib/annulation-resa";
import { CanalBadge, CanalDot } from "@/components/app/canal-badge";
import { canalPlanningStyle, normaliseCanal, SOURCE_META } from "@/lib/canal";
import type { TarificationReservation, TarificationVilla } from "@/lib/pricelabs/sync";
import { joursVilla } from "@/lib/pricelabs/jours";
import { formatHeureMaroc } from "@/lib/journal-format";
import { NuitsIsoleesPanel } from "@/components/app/nuits-isolees-panel";
import { NuitsMinimumSheet, type CibleNuitsMin } from "@/components/app/nuits-minimum-sheet";
import type { NuitIsolee, RapportNuitsIsolees } from "@/lib/beds24/nuits-isolees";

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
  // Nuits isolées (rapport chargé par le bandeau, voir nuits-isolees-panel.tsx) : repérées dans la
  // grille et dans la ligne "Nombre de nuits minimum" des logements dépliés.
  const [rapportNuits, setRapportNuits] = useState<RapportNuitsIsolees | null>(null);
  const [rechargementNuits, setRechargementNuits] = useState(0);
  const nuitsIsoleesParVilla = useMemo(() => {
    const parVilla = new Map<string, Map<string, NuitIsolee>>();
    for (const l of rapportNuits?.logements ?? []) {
      const parDate = new Map<string, NuitIsolee>();
      for (const n of l.nuitsIsolees) for (const d of n.dates) parDate.set(d, n);
      parVilla.set(l.villaId, parDate);
    }
    return parVilla;
  }, [rapportNuits]);

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

  // Annulation optimiste : la barre disparaît tout de suite, et revient si le serveur refuse.
  function handleReservationRestauree(villaId: string, reservation: TarificationReservation) {
    setVillasTarifs((prev) => prev.map((v) => (v.id !== villaId ? v : { ...v, reservations: [...v.reservations, reservation] })));
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

      {lectureSeule || villasTarifs.length === 0 ? null : (
        <NuitsIsoleesPanel onRapport={setRapportNuits} rechargement={rechargementNuits} />
      )}

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
          tousLogements={villasTarifs}
          lectureSeule={lectureSeule}
          nuitsIsolees={nuitsIsoleesParVilla}
          onNuitsMinModifiees={() => setRechargementNuits((n) => n + 1)}
          onNotesUpdated={handleNotesUpdated}
          onReservationSupprimee={handleReservationSupprimee}
          onReservationRestauree={handleReservationRestauree}
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
  { key: "min", label: "Nombre de nuits minimum", aide: "Durée minimale d'un séjour qui commence ce jour-là. Cliquer une case pour la modifier." },
  { key: "max", label: "Nombre de nuits maximum", aide: "Durée maximale d'un séjour qui commence ce jour-là." },
  { key: "arrivee", label: "Arrivées bloquées", aide: "Oui = aucun voyageur ne peut arriver ce jour-là." },
  { key: "depart", label: "Départs bloqués", aide: "Oui = aucun voyageur ne peut partir ce jour-là." },
] as const;
// Comme SuperHote : on garde quelques jours de passé à gauche d'aujourd'hui (séjours qui viennent
// de se terminer, affichés grisés).
// Kamel, 2026-10-21 : "je peux aller en avant mais pas en arrière" — on peut maintenant remonter
// de 6 mois ; la vue s'ouvre toujours sur aujourd'hui moins JOURS_VISIBLES_AVANT_AUJOURDHUI.
// Ce nombre doit rester aligné sur JOURS_PASSES_RESERVATIONS (lib/pricelabs/sync.ts).
const JOURS_PASSES_PLANNING = 180;
const JOURS_VISIBLES_AVANT_AUJOURDHUI = 4;

// Fenêtre de colonnes réellement rendues (virtualisation horizontale). La grille compte 545 jours
// × 16 logements ≈ 9 000 cases (plus 5 lignes × 545 par logement déplié) : tout rendre figeait le
// téléphone à l'ouverture et à chaque défilement (le mois en en-tête changeait d'état à chaque
// pixel, donc re-rendu complet). On ne rend que l'écran visible plus une marge de deux semaines de
// chaque côté, et la fenêtre ne bouge que par pas d'une semaine pour ne pas re-rendre en continu.
const MARGE_COLONNES = 14;
const PAS_FENETRE = 7;
type Fenetre = { debut: number; fin: number }; // index de colonne [debut, fin)

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
  tousLogements,
  lectureSeule,
  nuitsIsolees,
  onNuitsMinModifiees,
  onNotesUpdated,
  onReservationSupprimee,
  onReservationRestauree,
}: {
  villas: TarificationVilla[];
  tousLogements: TarificationVilla[];
  lectureSeule: boolean;
  nuitsIsolees: Map<string, Map<string, NuitIsolee>>;
  onNuitsMinModifiees: () => void;
  onNotesUpdated: (villaId: string, reservationId: string, notes: string) => void;
  onReservationSupprimee: (villaId: string, reservationId: string) => void;
  onReservationRestauree: (villaId: string, reservation: TarificationReservation) => void;
}) {
  const [resaSelectionnee, setResaSelectionnee] = useState<ReservationSelectionnee | null>(null);
  const estMobile = useEstMobile();
  // La grille n'est rendue que dans le navigateur : le serveur ne connaît pas la largeur de
  // l'écran (useEstMobile y répond "ordinateur"), et rendre 9 000 cases dans le HTML pour les
  // re-rendre aussitôt en version mobile doublait le travail du téléphone — et gonflait la page
  // /calendrier à 2,6 Mo. Le temps de l'hydratation, une carte vide de la bonne hauteur.
  const monte = useMonte();

  function handleNotesSaved(notes: string) {
    if (!resaSelectionnee) return;
    setResaSelectionnee({ ...resaSelectionnee, notes: notes || null });
    onNotesUpdated(resaSelectionnee.villaId, resaSelectionnee.id, notes);
  }

  return (
    <>
      {monte ? (
        <TarificationGrid
          villas={villas}
          tousLogements={tousLogements}
          dims={estMobile ? DIMS_MOBILE : DIMS_BUREAU}
          lectureSeule={lectureSeule}
          nuitsIsolees={nuitsIsolees}
          onNuitsMinModifiees={onNuitsMinModifiees}
          onSelectReservation={setResaSelectionnee}
        />
      ) : (
        <Card className="gap-0 overflow-hidden rounded-xl py-0">
          <div className="h-10 border-b" />
          <div className="animate-pulse" style={{ height: DIMS_BUREAU.headerMonth + DIMS_BUREAU.headerDays + villas.length * DIMS_BUREAU.row }} />
        </Card>
      )}
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
        onAnnuler={(motif) => {
          if (!resaSelectionnee) return;
          const { villaId, villaNom, ...resa } = resaSelectionnee;
          void villaNom; // le planning ne garde que les champs de la réservation
          onReservationSupprimee(villaId, resa.id);
          setResaSelectionnee(null);
          annulerReservation(resa.id, motif)
            .then(() => toast.success("Réservation annulée."))
            .catch((err) => {
              onReservationRestauree(villaId, resa);
              toast.error(err instanceof Error ? err.message : "Annulation impossible, la réservation a été remise.");
            });
        }}
      />
    </>
  );
}

// Vrai une fois le composant monté dans le navigateur (faux pendant le rendu serveur et
// l'hydratation), sans effet ni état supplémentaire.
function useMonte(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
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

// Fenêtre de colonnes à rendre pour une position de défilement et une largeur visibles, arrondie
// à la semaine pour que la valeur (et donc le rendu) ne change pas à chaque pixel.
function fenetrePour(scrollLeft: number, largeurVisible: number, colWidth: number, nbColonnes: number): Fenetre {
  const premiere = Math.floor(scrollLeft / colWidth);
  const visibles = Math.ceil(largeurVisible / colWidth) + 1;
  const debut = Math.max(0, Math.floor((premiere - MARGE_COLONNES) / PAS_FENETRE) * PAS_FENETRE);
  const fin = Math.min(nbColonnes, Math.ceil((premiere + visibles + MARGE_COLONNES) / PAS_FENETRE) * PAS_FENETRE);
  return { debut, fin };
}

// Grille villas × jours (logements en lignes, colonne fixe à gauche ; dates en colonnes avec
// défilement horizontal), mise en forme SuperHote v2.
function TarificationGrid({
  villas,
  tousLogements,
  dims,
  lectureSeule,
  nuitsIsolees,
  onNuitsMinModifiees,
  onSelectReservation,
}: {
  villas: TarificationVilla[];
  tousLogements: TarificationVilla[];
  dims: Dims;
  lectureSeule: boolean;
  nuitsIsolees: Map<string, Map<string, NuitIsolee>>;
  onNuitsMinModifiees: () => void;
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
  const debutVue = (JOURS_PASSES_PLANNING - JOURS_VISIBLES_AVANT_AUJOURDHUI) * COL_WIDTH;
  const [largeurVisible, setLargeurVisible] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  // Fenêtre initiale centrée sur l'ouverture (aujourd'hui), pas sur la colonne 0 : évite de rendre
  // janvier pour défiler aussitôt vers aujourd'hui.
  const [fenetre, setFenetre] = useState<Fenetre>(() => fenetrePour(debutVue, 1200, COL_WIDTH, dateStrings.length));
  const [premierIndexVisible, setPremierIndexVisible] = useState(JOURS_PASSES_PLANNING - JOURS_VISIBLES_AVANT_AUJOURDHUI);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: debutVue });
    const observer = new ResizeObserver(() => setLargeurVisible(el.clientWidth));
    observer.observe(el);
    setLargeurVisible(el.clientWidth);
    return () => observer.disconnect();
    // Seulement à l'ouverture (et si la largeur des colonnes change) : jamais pendant la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [COL_WIDTH]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prochaine = fenetrePour(el.scrollLeft, largeurVisible, COL_WIDTH, dateStrings.length);
    setFenetre((f) => (f.debut === prochaine.debut && f.fin === prochaine.fin ? f : prochaine));
  }, [largeurVisible, COL_WIDTH, dateStrings.length]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const premier = Math.round(el.scrollLeft / COL_WIDTH);
      // Le mois en en-tête ne change qu'à la frontière d'un mois : on ne met à jour l'état que là.
      setPremierIndexVisible((prev) => (dateStrings[prev]?.slice(0, 7) === dateStrings[premier]?.slice(0, 7) ? prev : premier));
      const prochaine = fenetrePour(el.scrollLeft, largeurVisible, COL_WIDTH, dateStrings.length);
      setFenetre((f) => (f.debut === prochaine.debut && f.fin === prochaine.fin ? f : prochaine));
    });
  }
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const [ouvertes, setOuvertes] = useState<Set<string>>(() => new Set());
  // Case "Nombre de nuits minimum" cliquée (panneau d'édition façon SuperHote) et compteur par
  // logement pour relire Beds24 après une modification.
  const [cibleNuitsMin, setCibleNuitsMin] = useState<CibleNuitsMin | null>(null);
  const [versionsDetails, setVersionsDetails] = useState<Record<string, number>>({});
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

  const largeurTotale = COL_WIDTH * dateList.length;
  const colonnes = useMemo(() => {
    const out: number[] = [];
    for (let i = fenetre.debut; i < fenetre.fin; i++) out.push(i);
    return out;
  }, [fenetre]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => scrollRef.current?.scrollTo({ left: debutVue, behavior: "smooth" })}>
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
                        qu'un texte dans la ligne, qui passait sous les barres de réservation. Le
                        détail (quelle erreur, de quand datent les prix affichés) est dans la ligne
                        "Prix nuitée" une fois le logement déplié — pas de survol sur téléphone. */}
                    {v.error ? (
                      <span title={explicationErreurPrix(v)} aria-label={explicationErreurPrix(v)}>
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

            <div ref={scrollRef} className="overflow-x-auto" onScroll={onScroll}>
              <div style={{ width: largeurTotale }}>
                <div style={{ height: HEADER_MONTH_HEIGHT }} />
                <div className="relative border-b" style={{ height: HEADER_DAYS_HEIGHT }}>
                  {colonnes.map((i) => {
                    const d = dateList[i];
                    const estAujourdhui = dateStrings[i] === aujourdhui;
                    const weekEnd = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={dateStrings[i]} className="absolute top-0 bottom-0 p-0.5 pb-1.5" style={{ left: i * COL_WIDTH, width: COL_WIDTH }}>
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
                        colonnes={colonnes}
                        aujourdhui={aujourdhui}
                        dims={dims}
                        nuitsIsolees={nuitsIsolees.get(v.id)}
                        onSelectReservation={onSelectReservation}
                      />
                      {ouvertes.has(v.id) ? (
                        <VillaDetailRows
                          villa={v}
                          dateStrings={dateStrings}
                          colonnes={colonnes}
                          aujourdhui={aujourdhui}
                          dims={dims}
                          version={versionsDetails[v.id] ?? 0}
                          nuitsIsolees={nuitsIsolees.get(v.id)}
                          onEditerMin={
                            lectureSeule
                              ? undefined
                              : (date, minStay) => {
                                  const isolee = nuitsIsolees.get(v.id)?.get(date);
                                  setCibleNuitsMin({ villaId: v.id, villaNom: v.nom, date, minStay, nuitIsolee: isolee ? { nuits: isolee.nuits } : null });
                                }
                          }
                        />
                      ) : null}
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
      {lectureSeule ? null : (
        <NuitsMinimumSheet
          cible={cibleNuitsMin}
          logements={tousLogements.map((l) => ({ id: l.id, nom: l.nom, beds24RoomId: l.beds24RoomId }))}
          onClose={() => setCibleNuitsMin(null)}
          onSaved={(villaIds) => {
            setVersionsDetails((prev) => {
              const next = { ...prev };
              for (const id of villaIds) next[id] = (next[id] ?? 0) + 1;
              return next;
            });
            onNuitsMinModifiees();
          }}
        />
      )}
    </div>
  );
}

// Texte du triangle d'alerte : l'erreur PriceLabs telle quelle n'aide personne ("Listing data
// does not exist in PriceLabs") — on dit ce que ça veut dire et de quand datent les prix affichés.
function explicationErreurPrix(villa: TarificationVilla): string {
  const depuis = villa.prixDu ? ` (prix PriceLabs du ${format(parseISO(villa.prixDu), "d MMM", { locale: fr })} affichés)` : " (aucun prix PriceLabs connu)";
  if (villa.error && /does not exist/i.test(villa.error)) {
    return `PriceLabs n'a pas encore recalculé cette annonce aujourd'hui${depuis}. Un recalcul a été demandé, réessayez « Actualiser les prix » dans quelques minutes.`;
  }
  if (villa.error && /introuvable/i.test(villa.error)) {
    return `Annonce introuvable dans PriceLabs : identifiant à vérifier dans la fiche du logement${depuis}.`;
  }
  return `PriceLabs ne répond pas pour ce logement${depuis} : ${villa.error ?? ""}`.trim();
}

const VillaCalendarRow = memo(function VillaCalendarRow({
  villa,
  dateStrings,
  colonnes,
  aujourdhui,
  dims,
  nuitsIsolees,
  onSelectReservation,
}: {
  villa: TarificationVilla;
  dateStrings: string[];
  colonnes: number[];
  aujourdhui: string;
  dims: Dims;
  nuitsIsolees?: Map<string, NuitIsolee>;
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const { col: COL_WIDTH, row: ROW_HEIGHT, compact } = dims;
  const largeurTotale = COL_WIDTH * dateStrings.length;
  const dayByDate = useMemo(() => new Map(joursVilla(villa).map((d) => [d.date, d])), [villa]);
  const resas = useMemo(() => reservationsVisibles(villa.reservations, dateStrings), [villa.reservations, dateStrings]);
  // Deux séjours actifs sur les mêmes nuits (ex. résa saisie à la main jamais retirée + résa
  // Beds24) : liseré rouge et badge pour les repérer sans chercher.
  const enChevauchement = useMemo(() => reservationsEnChevauchement(villa.reservations), [villa.reservations]);
  // Jours couverts par une barre : pas de prix ni de hachures dessous.
  const couverts = useMemo(() => new Set(resas.flatMap((r) => dateStrings.filter((d) => d >= r.checkIn && d < r.checkOut))), [resas, dateStrings]);
  // Barres dont au moins une partie tombe dans la fenêtre rendue.
  const premiereDate = dateStrings[colonnes[0] ?? 0];
  const derniereDate = dateStrings[colonnes[colonnes.length - 1] ?? dateStrings.length - 1];
  const resasFenetre = resas.filter((r) => r.checkIn <= derniereDate && r.checkOut > premiereDate);

  return (
    <div className="relative border-b" style={{ height: ROW_HEIGHT, width: largeurTotale }}>
      {colonnes.map((i) => {
        const date = dateStrings[i];
        const passe = date < aujourdhui;
        const jour = dayByDate.get(date);
        const couvert = couverts.has(date);
        const bloque = !passe && !couvert && !villa.error && (!jour || jour.unbookable || jour.price == null);
        const isolee = !passe && !couvert ? nuitsIsolees?.get(date) : undefined;
        const isoleeBloquee = isolee?.statut === "a_debloquer" || isolee?.statut === "echec";
        return (
          <div
            key={date}
            className={`absolute top-0 bottom-0 flex items-center justify-end border-r tabular-nums ${compact ? "px-1 text-xs" : "px-2 text-sm"}`}
            style={{
              left: i * COL_WIDTH,
              width: COL_WIDTH,
              backgroundImage: bloque
                ? "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 7px)"
                : undefined,
            }}
          >
            {/* Nuit isolée entre deux séjours : orange tant qu'elle n'est pas réservable (nuits
                min. trop longues), verte une fois débloquée. */}
            {isolee ? (
              <span
                title={
                  isoleeBloquee
                    ? `Nuit isolée : ${isolee.minStay ?? "?"} nuits min. pour ${isolee.nuits} nuit(s) libre(s), non réservable`
                    : `Nuit isolée réservable (${isolee.minStay ?? 1} nuit min.)`
                }
                className={`absolute top-1 left-1 rounded font-semibold leading-none ${compact ? "h-1.5 w-1.5 rounded-full" : "px-1 py-0.5 text-[9px]"} ${
                  isoleeBloquee ? "bg-amber-500 text-white" : "bg-green-600/15 text-green-700 dark:text-green-400"
                } ${compact && !isoleeBloquee ? "bg-green-600" : ""}`}
              >
                {compact ? null : "isolée"}
              </span>
            ) : null}
            {!passe && !couvert && !bloque && jour?.price != null ? formatPrixCompact(jour.price, villa.currency) : null}
          </div>
        );
      })}

      {resasFenetre.map((r) => {
        const { left, width } = barPosition(r, dateStrings, COL_WIDTH);
        const termine = r.checkOut <= aujourdhui;
        const canal = normaliseCanal(r.canal);
        const chevauche = enChevauchement.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            title={`${chevauche ? "Chevauchement : " : ""}${r.guestName} · ${format(parseISO(r.checkIn), "d MMM", { locale: fr })} → ${format(parseISO(r.checkOut), "d MMM", { locale: fr })}`}
            onClick={() => onSelectReservation({ villaId: villa.id, villaNom: villa.nom, ...r })}
            className={`absolute top-1.5 bottom-1.5 z-10 flex min-w-0 items-center rounded-lg border text-left font-semibold ${compact ? "px-1 text-xs" : "px-1.5 text-sm"} transition-[filter] hover:brightness-95 dark:hover:brightness-125 ${
              termine ? "opacity-50" : ""
            } ${chevauche ? "ring-2 ring-red-500 ring-offset-0" : ""}`}
            style={{ left, width, ...canalPlanningStyle(canal) }}
          >
            {chevauche ? (
              <span
                className={`pointer-events-none absolute right-1 -top-1.5 z-20 rounded-full bg-red-600 font-semibold leading-none text-white ${compact ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]"}`}
              >
                {compact ? "!" : "Chevauchement"}
              </span>
            ) : null}
            <span className={`sticky left-1.5 flex min-w-0 items-center ${compact ? "gap-1" : "gap-2"}`}>
              <CanalDot canal={r.canal} size={compact ? "md" : "lg"} />
              <span className="truncate">{r.guestName}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
});

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
// Ligne "Nombre de nuits minimum" : chaque case (aujourd'hui et après) ouvre le panneau
// d'édition (onEditerMin), comme sur SuperHote v2. `version` change après une modification pour
// relire Beds24 au lieu du cache.
// Les détails sont lus d'aujourd'hui à la fin du planning (12 mois) : depuis que la grille remonte
// 6 mois en arrière (2026-10-21), demander toute la fenêtre (545 jours) dépassait la limite de
// l'API (/api/beds24/calendrier refuse au-delà de 400 jours : "Période trop longue") et les
// lignes restaient vides. Les restrictions des jours passés n'ont de toute façon aucun intérêt.
const VillaDetailRows = memo(function VillaDetailRows({
  villa,
  dateStrings,
  colonnes,
  aujourdhui,
  dims,
  version = 0,
  nuitsIsolees,
  onEditerMin,
}: {
  villa: TarificationVilla;
  dateStrings: string[];
  colonnes: number[];
  aujourdhui: string;
  dims: Dims;
  version?: number;
  nuitsIsolees?: Map<string, NuitIsolee>;
  onEditerMin?: (date: string, minStay: number | null) => void;
}) {
  const { col: COL_WIDTH, detailRow: DETAIL_ROW_HEIGHT, compact } = dims;
  const roomId = villa.beds24RoomId ? Number(villa.beds24RoomId) : null;
  const from = aujourdhui;
  const to = dateStrings[dateStrings.length - 1];
  const cleCache = roomId ? `${roomId}:${from}:${to}:${version}` : null;
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

  const parDate = useMemo(() => new Map((details ?? []).map((d) => [d.date, d])), [details]);
  const { prixPricelabs, minPricelabs } = useMemo(() => {
    const jours = joursVilla(villa);
    return {
      prixPricelabs: new Map(jours.map((d) => [d.date, d.price])),
      minPricelabs: new Map(jours.map((d) => [d.date, d.minStay ?? null])),
    };
  }, [villa]);
  const chargement = Boolean(roomId) && !details && !erreur;
  const message = !roomId
    ? "Villa pas encore reliée à Beds24 : prix PriceLabs uniquement."
    : (erreur ?? (villa.error ? explicationErreurPrix(villa) : null));

  function valeur(ligne: (typeof LIGNES_DETAIL)[number]["key"], date: string): string {
    const d = parDate.get(date);
    const passe = date < aujourdhui;
    switch (ligne) {
      case "prix": {
        const prix = d?.price ?? prixPricelabs.get(date) ?? null;
        return prix != null ? formatPrixCompact(prix, villa.currency ?? "EUR") : "";
      }
      case "min": {
        // Beds24 (valeur réellement envoyée à Airbnb/Booking) ; à défaut celle de PriceLabs.
        const min = d?.minStay ?? (roomId ? null : (minPricelabs.get(date) ?? null));
        return min != null ? String(min) : roomId && !passe ? "" : "—";
      }
      case "max":
        return d?.maxStay != null ? String(d.maxStay) : roomId && !passe ? "" : "—";
      case "arrivee":
        return d ? (d.arriveeBloquee ? "Oui" : "Non") : roomId && !passe ? "" : "—";
      case "depart":
        return d ? (d.departBloque ? "Oui" : "Non") : roomId && !passe ? "" : "—";
    }
  }

  return (
    <div className="relative bg-muted/40">
      {LIGNES_DETAIL.map((ligne) => (
        <div key={ligne.key} className="relative border-b" style={{ height: DETAIL_ROW_HEIGHT, width: COL_WIDTH * dateStrings.length }}>
          {colonnes.map((i) => {
            const date = dateStrings[i];
            const texte = valeur(ligne.key, date);
            const bloque = texte === "Oui";
            const classeBase = `absolute top-0 bottom-0 flex items-center justify-end border-r tabular-nums ${compact ? "px-1 text-xs" : "px-2 text-sm"} ${
              date < aujourdhui ? "text-muted-foreground" : ""
            } ${bloque ? "font-semibold text-destructive" : ""}`;
            if (ligne.key === "min" && onEditerMin && roomId && date >= aujourdhui) {
              const isolee = nuitsIsolees?.get(date);
              const isoleeBloquee = isolee?.statut === "a_debloquer" || isolee?.statut === "echec";
              const minActuel = parDate.get(date)?.minStay ?? null;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onEditerMin(date, minActuel)}
                  title={
                    isolee
                      ? isoleeBloquee
                        ? "Nuit isolée non réservable : cliquer pour modifier les nuits minimum"
                        : "Nuit isolée débloquée : cliquer pour modifier les nuits minimum"
                      : "Modifier le nombre de nuits minimum"
                  }
                  className={`${classeBase} cursor-pointer transition-colors hover:bg-primary/10 hover:text-foreground ${
                    isoleeBloquee
                      ? "bg-amber-500/20 font-semibold text-amber-700 dark:text-amber-400"
                      : isolee
                        ? "font-semibold text-green-700 dark:text-green-400"
                        : ""
                  }`}
                  style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                >
                  {texte}
                </button>
              );
            }
            return (
              <div key={date} className={classeBase} style={{ left: i * COL_WIDTH, width: COL_WIDTH }}>
                {texte}
              </div>
            );
          })}
        </div>
      ))}
      {chargement || message ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center" style={{ height: DETAIL_ROW_HEIGHT }}>
          <span className="sticky left-3 max-w-[70vw] truncate rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm" title={message ?? undefined}>
            {chargement ? "Chargement des détails Beds24…" : message}
          </span>
        </div>
      ) : null}
    </div>
  );
});

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
  onAnnuler,
}: {
  reservation: ReservationSelectionnee | null;
  lectureSeule: boolean;
  onOpenChange: (open: boolean) => void;
  onNotesSaved: (notes: string) => void;
  onSupprimee: () => void;
  onAnnuler: (motif: string) => void;
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
            {reservation.lienPlateforme ? (
              <Button asChild className={`w-full text-white hover:text-white hover:opacity-90 ${reservation.lienPlateforme.libelle.includes("Booking") ? "bg-[#003580] hover:bg-[#003580]" : "bg-[#ff385c] hover:bg-[#ff385c]"}`}>
                <a href={reservation.lienPlateforme.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {reservation.lienPlateforme.libelle}
                </a>
              </Button>
            ) : null}
            <AnnulerReservationInline key={reservation.id} reservation={reservation} onAnnuler={onAnnuler} />
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

// Annulation locale (soft delete) d'une réservation, confirmée dans la fenêtre elle-même : motif,
// avertissement si de l'argent est déjà encaissé, puis un seul appel serveur (optimiste, géré par
// le parent via onAnnuler).
function AnnulerReservationInline({ reservation, onAnnuler }: { reservation: ReservationSelectionnee; onAnnuler: (motif: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [vu, setVu] = useState(false);
  const avertissement = avertissementEncaisse(encaisse(reservation), (n) => formatMontant(n, reservation.devise));
  const synchronisee = reservation.source !== "manuel";
  const pret = motif !== null && (avertissement === null || vu);

  if (!ouvert) {
    return (
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive max-md:h-10"
          onClick={() => setOuvert(true)}
        >
          <Ban className="h-4 w-4" />
          Annuler la réservation
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">Pourquoi annuler cette réservation ?</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motif de l'annulation">
        {MOTIFS_ANNULATION.map((m) => (
          <button
            key={m.code}
            type="button"
            role="radio"
            aria-checked={motif === m.code}
            onClick={() => setMotif(m.code)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-md:py-2.5 ${
              motif === m.code ? "border-[#660033] bg-[#660033] text-white" : "bg-background hover:bg-muted"
            }`}
          >
            {m.libelle}
          </button>
        ))}
      </div>
      {avertissement ? (
        <label className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
          <input type="checkbox" className="mt-0.5" checked={vu} onChange={(e) => setVu(e.target.checked)} />
          <span>
            Attention : {avertissement}. Je confirme vouloir annuler quand même.
          </span>
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {synchronisee
          ? "Nettoyage local uniquement : rien n'est annulé sur Booking.com, Airbnb ou Beds24, et la prochaine synchro ne la recrée pas."
          : "Nettoyage local uniquement : rien n'est annulé sur Booking.com, Airbnb ou Beds24. Pour rouvrir les dates, utilise « Supprimer »."}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 max-md:h-10" onClick={() => setOuvert(false)}>
          Retour
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!pret}
          className="flex-1 bg-[#660033] text-white hover:bg-[#660033]/90 max-md:h-10"
          onClick={() => motif && onAnnuler(motif)}
        >
          Confirmer
        </Button>
      </div>
    </div>
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
