"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { PhoneLink } from "@/components/app/phone-link";
import { EditNotesButton } from "@/components/app/edit-notes-button";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un logement..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex items-center gap-3">
          {plusAncienneSynchro ? (
            <p className="text-xs text-muted-foreground">
              Prix mis à jour {formatDistanceToNow(parseISO(plusAncienneSynchro), { addSuffix: true, locale: fr })}
            </p>
          ) : null}
          <Button variant="outline" size="sm" onClick={actualiser} disabled={loading}>
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
        <TarificationCalendarGrid villas={villasFiltrees} onNotesUpdated={handleNotesUpdated} />
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

// Colonnes resserrées pour voir davantage de jours sans défiler — Kamel, 2026-09-28 : "c'est
// possible de baisser un peu la police pour voir tout le mois ?". Un mois entier (jusqu'à 31
// jours) tient rarement sans défiler du tout sur un écran normal en gardant les prix lisibles
// (Airbnb lui-même ne montre qu'une poignée de jours à la fois sur sa propre capture) — mais on
// en affiche nettement plus qu'avant, et le sélecteur de mois + les flèches restent là pour le
// reste.
const COL_WIDTH = 46;
const SIDEBAR_WIDTH = 200;
const ROW_HEIGHT = 44;
const CALENDAR_DAYS = 365;

type ReservationSelectionnee = { villaId: string; villaNom: string } & TarificationReservation;

// Calendrier hôte façon Airbnb : logements en lignes (colonne fixe à gauche), dates en colonnes
// (défilement horizontal, sélecteur de mois pour sauter directement à une période), barres de
// réservation superposées aux cellules de prix, cliquables pour un récapitulatif — Kamel,
// 2026-09-28, captures d'écran Airbnb à l'appui.
function TarificationCalendarGrid({
  villas,
  onNotesUpdated,
}: {
  villas: TarificationVilla[];
  onNotesUpdated: (villaId: string, reservationId: string, notes: string) => void;
}) {
  const [resaSelectionnee, setResaSelectionnee] = useState<ReservationSelectionnee | null>(null);

  function handleNotesSaved(notes: string) {
    if (!resaSelectionnee) return;
    setResaSelectionnee({ ...resaSelectionnee, notes: notes || null });
    onNotesUpdated(resaSelectionnee.villaId, resaSelectionnee.id, notes);
  }

  const dateList = useMemo(() => Array.from({ length: CALENDAR_DAYS }, (_, i) => addDays(new Date(), i)), []);
  const dateStrings = useMemo(() => dateList.map((d) => format(d, "yyyy-MM-dd")), [dateList]);
  const aujourdhui = dateStrings[0];

  const moisGroupes = useMemo(() => {
    const groupes: { label: string; count: number; startIndex: number }[] = [];
    dateList.forEach((d, i) => {
      const label = format(d, "MMMM yyyy", { locale: fr });
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.label === label) dernier.count++;
      else groupes.push({ label, count: 1, startIndex: i });
    });
    return groupes;
  }, [dateList]);

  const scrollRef = useRef<HTMLDivElement>(null);
  function scroll(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }
  function allerAuMois(label: string) {
    const mois = moisGroupes.find((m) => m.label === label);
    if (mois) scrollRef.current?.scrollTo({ left: mois.startIndex * COL_WIDTH, behavior: "smooth" });
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <Select onValueChange={allerAuMois}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Aller à un mois..." />
          </SelectTrigger>
          <SelectContent>
            {moisGroupes.map((m) => (
              <SelectItem key={m.label} value={m.label} className="capitalize">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" })}>
          Aujourd&apos;hui
        </Button>
      </div>

      <div className="flex">
        <div className="shrink-0 border-r" style={{ width: SIDEBAR_WIDTH }}>
          <div className="flex items-center border-b px-3 text-sm font-medium text-muted-foreground" style={{ height: ROW_HEIGHT * 2 }}>
            {villas.length} logement{villas.length > 1 ? "s" : ""}
          </div>
          {villas.map((v) => (
            <div key={v.id} className="flex items-center gap-2 border-b px-3" style={{ height: ROW_HEIGHT }}>
              {v.photoUrl ? (
                <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
                  <Image src={v.photoUrl} alt="" fill sizes="24px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="min-w-0 truncate text-xs font-medium">{v.nom}</span>
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            aria-label="Reculer"
            onClick={() => scroll(-COL_WIDTH * 5)}
            className="absolute top-1/2 left-1.5 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Avancer"
            onClick={() => scroll(COL_WIDTH * 5)}
            className="absolute top-1/2 right-1.5 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div ref={scrollRef} className="overflow-x-auto">
            <div style={{ width: COL_WIDTH * dateList.length }}>
              <div className="flex border-b" style={{ height: ROW_HEIGHT }}>
                {moisGroupes.map((m) => (
                  <div
                    key={m.label}
                    className="flex shrink-0 items-center border-r px-2 text-xs font-medium capitalize"
                    style={{ width: COL_WIDTH * m.count }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="flex border-b" style={{ height: ROW_HEIGHT }}>
                {dateList.map((d, i) => (
                  <div
                    key={dateStrings[i]}
                    className="flex shrink-0 flex-col items-center justify-center border-r text-[10px]"
                    style={{ width: COL_WIDTH }}
                  >
                    <span className="text-muted-foreground uppercase">{format(d, "EEEEE", { locale: fr })}</span>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full font-medium ${
                        dateStrings[i] === aujourdhui ? "bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {format(d, "d")}
                    </span>
                  </div>
                ))}
              </div>

              {villas.map((v) => (
                <VillaCalendarRow key={v.id} villa={v} dateStrings={dateStrings} onSelectReservation={setResaSelectionnee} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <ReservationRecapDialog
        reservation={resaSelectionnee}
        onOpenChange={(open) => !open && setResaSelectionnee(null)}
        onNotesSaved={handleNotesSaved}
      />
    </Card>
  );
}

function VillaCalendarRow({
  villa,
  dateStrings,
  onSelectReservation,
}: {
  villa: TarificationVilla;
  dateStrings: string[];
  onSelectReservation: (r: ReservationSelectionnee) => void;
}) {
  const largeurTotale = COL_WIDTH * dateStrings.length;

  if (villa.error) {
    return (
      <div className="flex items-center border-b px-3 text-xs text-destructive" style={{ height: ROW_HEIGHT, width: largeurTotale }}>
        Prix temporairement indisponibles
      </div>
    );
  }

  const dayByDate = new Map(villa.days.map((d) => [d.date, d]));

  return (
    <div className="relative grid border-b" style={{ height: ROW_HEIGHT, gridTemplateColumns: `repeat(${dateStrings.length}, ${COL_WIDTH}px)` }}>
      {dateStrings.map((date, i) => {
        const jour = dayByDate.get(date);
        const bloque = !jour || jour.unbookable || jour.price == null;
        return (
          <div
            key={date}
            className="flex items-start justify-end border-r px-1 py-0.5 text-[10px]"
            style={{
              gridColumn: i + 1,
              gridRow: 1,
              backgroundColor: bloque ? "var(--muted)" : undefined,
              backgroundImage: bloque
                ? "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 7px)"
                : undefined,
            }}
          >
            {!bloque ? <span>{formatPrix(jour!.price!, villa.currency)}</span> : null}
          </div>
        );
      })}

      {villa.reservations.map((r, i) => {
        const { start, end } = barGridColumns(r, dateStrings);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelectReservation({ villaId: villa.id, villaNom: villa.nom, ...r })}
            className="relative m-0.5 flex items-center rounded-md bg-primary px-1.5 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            style={{ gridColumn: `${start} / ${end}`, gridRow: 1 }}
          >
            <span className="sticky left-1.5 truncate">
              {r.guestName}
              {r.montant != null ? ` ${formatMontant(r.montant, r.devise)}` : ""}
              {r.enCours ? " · Séjour en cours" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReservationRecapDialog({
  reservation,
  onOpenChange,
  onNotesSaved,
}: {
  reservation: ReservationSelectionnee | null;
  onOpenChange: (open: boolean) => void;
  onNotesSaved: (notes: string) => void;
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
                  <span className="font-medium">{reservation.canal}</span>
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
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Les lignes de grille sont 1-indexées : un séjour occupant les indices de jour [startIdx, endIdx[
// s'étend donc de la ligne startIdx+1 à endIdx+1. Une réservation déjà en cours avant le début de
// la fenêtre affichée (checkIn introuvable) démarre en butée gauche ; une réservation qui dépasse
// les 60 jours en cache (checkOut introuvable) s'étend jusqu'en butée droite — comme les barres
// coupées par le bord de l'écran sur le calendrier hôte Airbnb.
function barGridColumns(r: TarificationReservation, dateStrings: string[]): { start: number; end: number } {
  const startIdx = dateStrings.indexOf(r.checkIn);
  const endIdx = dateStrings.indexOf(r.checkOut);
  return {
    start: startIdx === -1 ? 1 : startIdx + 1,
    end: endIdx === -1 ? dateStrings.length + 1 : endIdx + 1,
  };
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

function formatMontant(montant: number, devise: string): string {
  return `${montant.toFixed(2).replace(".", ",")} ${currencySymbole(devise) || devise}`.trim();
}
