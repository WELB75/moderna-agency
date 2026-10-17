"use client";

import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Building2, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { DisponibiliteCalendar } from "@/components/app/disponibilite-calendar";
import { useEstMobile } from "@/lib/use-est-mobile";
import type { TarificationVilla } from "@/lib/pricelabs/sync";

// Devis rapide — sorti du Calendrier (vue planning) pour devenir une page à part, juste sous
// "Nouvelle réservation" dans le menu (Kamel, 2026-10-17 : "retire devis rapide d'ici et créer
// une autre section en dessous de nouvelle reservation"). Même composant qu'avant, inchangé.

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

type StatutSejour = "disponible" | "indisponible" | "invalide";

// Une nuit manquante dans le calendrier PriceLabs rend le séjour invalide ; une seule nuit prise
// suffit à le rendre indisponible. Partagé par le devis et par la grille des logements.
function evaluerSejour(villa: TarificationVilla, debut: string, fin: string): { statut: StatutSejour; nuits: number; total: number } {
  const debutDate = parseISO(debut);
  const finDate = parseISO(fin);
  if (finDate <= debutDate) return { statut: "invalide", nuits: 0, total: 0 };
  let total = 0;
  let nuits = 0;
  let manquantes = 0;
  let prises = 0;
  for (let cursor = debutDate; cursor < finDate; cursor = addDays(cursor, 1)) {
    const jour = villa.days.find((d) => d.date === format(cursor, "yyyy-MM-dd"));
    if (!jour) manquantes++;
    else if (jour.unbookable || jour.price == null) prises++;
    else {
      nuits++;
      total += jour.price;
    }
  }
  if (manquantes > 0) return { statut: "invalide", nuits, total };
  if (prises > 0) return { statut: "indisponible", nuits, total };
  return { statut: "disponible", nuits, total };
}

// Sélection d'une villa → prix du jour affiché immédiatement (pas besoin d'ouvrir la fiche
// villa) + un devis optionnel sur une plage de dates. Le prix PriceLabs est utilisé tel quel,
// SANS ajouter de marge : la commission Airbnb/Booking (~19%) est déjà intégrée dedans en amont
// par Kamel au moment de régler le prix net voulu dans PriceLabs (ex. 280€ net → 333€ affiché).
// Rajouter 19% ici doublerait la commission — comparé à une vraie réservation Airbnb (Villa
// Tania, 3 nuits x 333€ = 999€), c'est bien ce total brut qui correspond, pas 999 + 19%.
// Kamel, 2026-09-26, après une capture d'écran Airbnb montrant l'écart : "je crois qu'il faut
// les retirer".
//
// Kamel, 2026-10-16 : "sur devis rapide le calendrier est pas connecté à pricelabs" — les champs
// Du / Au étaient de simples dates du navigateur. Ils ouvrent maintenant le calendrier du
// logement choisi : prix PriceLabs de chaque nuit sous la date, nuits déjà prises barrées et non
// sélectionnables (mêmes données que la grille planning ci-dessous).
export function DevisRapide({ villas }: { villas: TarificationVilla[] }) {
  const [villaId, setVillaId] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);
  const estMobile = useEstMobile();

  const villa = villas.find((v) => v.id === villaId) ?? null;

  const calendrierVilla = useMemo(() => {
    if (!villa) return { nuitsPrises: new Set<string>(), libellesPrix: undefined, dernierJour: undefined };
    const nuitsPrises = new Set(villa.days.filter((d) => d.unbookable || d.price == null).map((d) => d.date));
    const libellesPrix = new Map(
      villa.days.filter((d) => d.price != null).map((d) => [d.date, formatPrixCompact(d.price as number, villa.currency)])
    );
    // Départ possible le lendemain de la dernière nuit connue de PriceLabs, pas au-delà.
    const derniere = villa.days.reduce<string | null>((max, d) => (max == null || d.date > max ? d.date : max), null);
    const dernierJour = derniere ? format(addDays(parseISO(derniere), 1), "yyyy-MM-dd") : undefined;
    return { nuitsPrises, libellesPrix, dernierJour };
  }, [villa]);

  const prixCeSoir = useMemo(() => {
    if (!villa) return null;
    const aujourdhui = format(new Date(), "yyyy-MM-dd");
    return villa.days.find((d) => d.date === aujourdhui) ?? null;
  }, [villa]);

  const devis = useMemo<DevisResultat | null>(() => {
    if (!villa || !debut || !fin) return null;
    if (parseISO(fin) <= parseISO(debut)) return { statut: "invalide", message: "La date de fin doit être après la date de début." };
    const r = evaluerSejour(villa, debut, fin);
    if (r.statut === "invalide") return { statut: "invalide", message: "Période hors du calendrier de prix disponible (1 an)." };
    // Une seule nuit déjà prise suffit à rendre le séjour demandé impossible tel quel — pas la
    // peine de détailler combien, "elle" a juste besoin de savoir si ça passe ou pas.
    if (r.statut === "indisponible") return { statut: "indisponible" };
    return { statut: "disponible", nuits: r.nuits, total: r.total };
  }, [villa, debut, fin]);

  return (
    <div className="space-y-5">
    {/* Pas de titre de carte : la page porte déjà le titre "Devis rapide". */}
    <Card className="max-w-3xl">
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
          <Popover open={calendrierOuvert} onOpenChange={setCalendrierOuvert}>
            <PopoverAnchor asChild>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                {(
                  [
                    ["devis-debut", "Du", debut, "Arrivée"],
                    ["devis-fin", "Au", fin, "Départ"],
                  ] as const
                ).map(([id, label, valeur, placeholder]) => (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={id}>{label}</Label>
                    <Button
                      id={id}
                      type="button"
                      variant="outline"
                      onClick={() => setCalendrierOuvert(true)}
                      className={`w-full justify-start font-normal ${valeur ? "" : "text-muted-foreground"}`}
                    >
                      <CalendarDays className="h-4 w-4" />
                      {valeur ? format(parseISO(valeur), "EEE d MMM yyyy", { locale: fr }) : placeholder}
                    </Button>
                  </div>
                ))}
              </div>
            </PopoverAnchor>
            <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-2">
              {!villa ? (
                <p className="px-1 text-xs text-muted-foreground">Choisis un logement pour voir ses prix PriceLabs et ses nuits déjà prises.</p>
              ) : null}
              <DisponibiliteCalendar
                nuitsPrises={calendrierVilla.nuitsPrises}
                libellesPrix={calendrierVilla.libellesPrix}
                dernierJour={calendrierVilla.dernierJour}
                nombreMois={estMobile ? 1 : 2}
                arrivee={debut}
                depart={fin}
                onChange={(a, d) => {
                  setDebut(a);
                  setFin(d);
                  if (a && d) setCalendrierOuvert(false);
                }}
              />
            </PopoverContent>
          </Popover>
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

    <ApercuLogements
      villas={villas}
      villaId={villaId}
      onChoisir={setVillaId}
      sejour={debut && fin && parseISO(fin) > parseISO(debut) ? { debut, fin } : null}
    />
    </div>
  );
}

type FiltreApercu = "tous" | "disponible" | "indisponible";

// Kamel, 2026-10-17 : "quand on clique sur Devis rapide, j'aimerais qu'on voit directement quelle
// villa est dispo et laquelle est occupée, avant même de cliquer". Sans dates : état de ce soir ;
// avec des dates : état sur la période choisie + total. Un clic sur une carte la sélectionne dans
// le formulaire du devis.
function ApercuLogements({
  villas,
  villaId,
  onChoisir,
  sejour,
}: {
  villas: TarificationVilla[];
  villaId: string;
  onChoisir: (id: string) => void;
  sejour: { debut: string; fin: string } | null;
}) {
  const [filtre, setFiltre] = useState<FiltreApercu>("tous");
  const aujourdhui = format(new Date(), "yyyy-MM-dd");

  const lignes = useMemo(() => {
    return villas.map((v) => {
      const ceSoir = v.days.find((d) => d.date === aujourdhui) ?? null;
      const prisCeSoir = ceSoir ? ceSoir.unbookable || ceSoir.price == null : null;
      // Prochain changement d'état à partir d'aujourd'hui : "libre le ..." si occupé ce soir,
      // "libre jusqu'au ..." (prochaine nuit prise) si libre.
      const futurs = v.days.filter((d) => d.date >= aujourdhui).sort((a, b) => a.date.localeCompare(b.date));
      const estPris = (d: { unbookable: boolean; price: number | null }) => d.unbookable || d.price == null;
      let prochain: string | null = null;
      if (prisCeSoir === false) prochain = futurs.find(estPris)?.date ?? null;
      else if (prisCeSoir === true) prochain = futurs.find((d) => !estPris(d))?.date ?? null;
      const resultat = sejour ? evaluerSejour(v, sejour.debut, sejour.fin) : null;
      const statut: "disponible" | "indisponible" | "inconnu" = resultat
        ? resultat.statut === "disponible"
          ? "disponible"
          : resultat.statut === "indisponible"
            ? "indisponible"
            : "inconnu"
        : prisCeSoir == null
          ? "inconnu"
          : prisCeSoir
            ? "indisponible"
            : "disponible";
      return { villa: v, ceSoir, prisCeSoir, prochain, resultat, statut };
    });
  }, [villas, aujourdhui, sejour]);

  const nbDispo = lignes.filter((l) => l.statut === "disponible").length;
  const nbOccupe = lignes.filter((l) => l.statut === "indisponible").length;

  const visibles = lignes
    .filter((l) => filtre === "tous" || l.statut === filtre)
    // Les disponibles d'abord (c'est ce qu'on cherche pour proposer un logement), puis l'ordre d'origine.
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.statut === "disponible" ? 0 : 1) - (b.l.statut === "disponible" ? 0 : 1) || a.i - b.i)
    .map((x) => x.l);

  const titre = sejour
    ? `Du ${format(parseISO(sejour.debut), "d MMM", { locale: fr })} au ${format(parseISO(sejour.fin), "d MMM", { locale: fr })}`
    : "Ce soir";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{titre}</h2>
          <span className="text-sm text-green-600 dark:text-green-400">{nbDispo} disponible(s)</span>
          <span className="text-sm text-red-600 dark:text-red-400">{nbOccupe} occupé(s)</span>
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["tous", "Tous"],
              ["disponible", "Disponibles"],
              ["indisponible", "Occupés"],
            ] as const
          ).map(([valeur, label]) => (
            <Button key={valeur} type="button" size="sm" variant={filtre === valeur ? "secondary" : "ghost"} onClick={() => setFiltre(valeur)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visibles.map(({ villa: v, ceSoir, prochain, resultat, statut }) => {
          const label = sejour
            ? statut === "disponible"
              ? "Disponible"
              : statut === "indisponible"
                ? "Occupé sur la période"
                : "Hors calendrier"
            : statut === "disponible"
              ? "Disponible ce soir"
              : statut === "indisponible"
                ? "Occupé ce soir"
                : "Prix inconnu";
          let detail: string | null = null;
          if (!sejour && prochain) {
            const date = format(parseISO(prochain), "EEE d MMM", { locale: fr });
            detail = statut === "disponible" ? `Libre jusqu'au ${date}` : `Libre le ${date}`;
          }
          const prix = sejour
            ? statut === "disponible" && resultat
              ? { montant: resultat.total, suffixe: `${resultat.nuits} nuit(s)` }
              : null
            : ceSoir && ceSoir.price != null && !ceSoir.unbookable
              ? { montant: ceSoir.price, suffixe: "ce soir" }
              : null;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChoisir(v.id)}
              className={`flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40 ${
                v.id === villaId ? "border-primary ring-1 ring-primary" : ""
              }`}
            >
              {v.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">{v.nom}</p>
                <DisponibiliteDot statut={statut} label={label} />
                {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
              </div>
              {prix ? (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{formatPrix(prix.montant, v.currency)}</p>
                  <p className="text-xs text-muted-foreground">{prix.suffixe}</p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      {visibles.length === 0 ? <p className="text-sm text-muted-foreground">Aucun logement dans cette catégorie.</p> : null}
    </section>
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
