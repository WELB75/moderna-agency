"use client";

import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
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
    // Pas de titre de carte : la page porte déjà le titre "Devis rapide".
    <Card>
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
