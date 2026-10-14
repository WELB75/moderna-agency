"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { Check, Copy, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReservation } from "@/lib/actions/reservations";
import { calculerPrixSejourAction, indisponibilitesAction } from "@/lib/actions/recaps";
import { DisponibiliteCalendar } from "@/components/app/disponibilite-calendar";
import type { PrixSejour } from "@/lib/pricelabs/sejour";
import { PersonnelAffectationEditor, type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import type { PersonnelOption } from "@/lib/personnel-options";
import { cn } from "@/lib/utils";

// Assistant en plusieurs étapes plutôt qu'un formulaire géant façon Superhote — Kamel,
// 2026-09-14 : "je veux un truc simple avec les infos principal et surtout un système pas avec
// tout d'un coup, on valide qq points ensuite on avance etc". Contenu partagé entre le dialogue
// (villa déjà connue, depuis la fiche villa) et la page dédiée "/reservations/nouvelle" (villa à
// choisir, accessible directement depuis la nav) — voir add-reservation-dialog.tsx.
//
// Étape "Personnel" ajoutée après coup — Kamel, 2026-09-15 : "faut faire un vrai truc pour
// ajouter facilement femme de ménage, cuisinière (petit dej seul ou petit dej et dejeuner)" au
// lieu de le décrire en texte libre dans les demandes particulières. Réutilise tel quel
// PersonnelAffectationEditor (même composant que sur la fiche réservation, "petit-déj
// seul"/"petit-déj + déjeuner" y est déjà géré) — n'apparaît qu'une fois la réservation créée,
// puisqu'il faut un reservationId réel pour y rattacher une affectation.
const STEPS_WITH_VILLA = ["Logement", "Séjour", "Voyageur", "Prix"] as const;
const STEPS_NO_VILLA = ["Séjour", "Voyageur", "Prix"] as const;

type TypeResa = "client" | "proprietaire" | "travaux" | "famille" | "autre";
const TYPES_RESA: { value: TypeResa; label: string; hint: string; nom: string }[] = [
  { value: "client", label: "Client", hint: "Séjour payant", nom: "" },
  { value: "proprietaire", label: "Propriétaire sur place", hint: "Blocage, sans prix", nom: "Propriétaire" },
  { value: "travaux", label: "Travaux", hint: "Blocage, sans prix", nom: "Travaux" },
  { value: "famille", label: "Famille / proches", hint: "Ménage seulement", nom: "Famille" },
  { value: "autre", label: "Autre blocage", hint: "Indisponible, sans prix", nom: "Blocage" },
];

const DEVISES = ["EUR", "MAD"] as const;
const MOYENS_PAIEMENT = [
  { value: "especes", label: "Espèces" },
  { value: "virement", label: "Virement" },
  { value: "carte", label: "Carte" },
] as const;

export function AddReservationWizard({
  domaines,
  villas,
  initialVillaId,
  villaLabel,
  menageOptions,
  cuisineOptions,
  menageOptionsByDomaine,
  cuisineOptionsByDomaine,
  villaPriceDefaults,
  onCreated,
}: {
  // Fourni depuis la page globale, avec `villas` — Kamel, 2026-09-15 : "tu met le choix du
  // domaine deja, ensuite on choisi l'appart ou la villa qui se trouve dans ce domaine". Choisir
  // le domaine d'abord filtre la liste des logements, plutôt que de tout dérouler d'un coup.
  domaines?: { id: string; nom: string }[];
  // Fourni depuis la page globale : la première étape propose de choisir le logement.
  villas?: { id: string; nom: string; numero: string; domaineId: string | null }[];
  // Fourni depuis la fiche villa : villa déjà fixée, pas de sélecteur à afficher.
  initialVillaId?: string;
  villaLabel?: string;
  // Fournis dans les deux cas : si présents, une étape "Personnel" apparaît après la création.
  // Depuis la fiche villa, le domaine est déjà connu : options triées par proximité toutes
  // prêtes. Depuis la page globale, le domaine n'est choisi qu'à l'étape 1 : on fournit plutôt
  // une option list par domaine, et le wizard prend la bonne tranche une fois choisi.
  menageOptions?: PersonnelOption[];
  cuisineOptions?: PersonnelOption[];
  menageOptionsByDomaine?: Record<string, PersonnelOption[]>;
  cuisineOptionsByDomaine?: Record<string, PersonnelOption[]>;
  // Caution/frais de ménage de départ connus par villa (voir whatsapp-agent/villas.ts) — Kamel,
  // 2026-09-15 : "tu connais les prix normalement, des cautions et des frais de menage (60 euros
  // si c une villa plein pied, 80 euros pour les villas R+1)". Préremplit dès que la villa est
  // choisie, toujours modifiable (pas de valeur connue pour les logements les plus récents).
  villaPriceDefaults?: Record<string, { caution: number; menage: number; prixNuit: number }>;
  onCreated?: (reservationId: string) => void;
}) {
  const showVillaStep = !initialVillaId && Boolean(villas);
  const showPersonnelStep = Boolean(menageOptions || cuisineOptions || menageOptionsByDomaine || cuisineOptionsByDomaine);
  // Dernière étape (après création) : personnel si les options sont fournies, et toujours le lien
  // de partage du récapitulatif.
  const STEPS = [...(showVillaStep ? STEPS_WITH_VILLA : STEPS_NO_VILLA), ...(showPersonnelStep ? (["Personnel"] as const) : (["Récap"] as const))];
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [createdReservationId, setCreatedReservationId] = useState<string | null>(null);
  // Miroir local de ce que PersonnelAffectationEditor affecte réellement en base — sans lui,
  // l'ajout retombait à vide dès que l'action serveur se terminait (voir onAssignedChange dans
  // personnel-affectation-editor.tsx). Kamel, 2026-09-15 : "QUAND JE VEUX AJOUTE FEMME DE MENAGE
  // ET CUISINIERE CA MARCHE PAS".
  const [menageAssigned, setMenageAssigned] = useState<PersonnelAssigne[]>([]);
  const [cuisineAssigned, setCuisineAssigned] = useState<PersonnelAssigne[]>([]);

  const [villaId, setVillaId] = useState(initialVillaId ?? "");
  const [domaineId, setDomaineId] = useState(() => (initialVillaId ? (villas?.find((v) => v.id === initialVillaId)?.domaineId ?? "") : ""));
  const villasDuDomaine = domaineId ? villas?.filter((v) => v.domaineId === domaineId) : [];
  // Kamel, 2026-09-15 : "je veux juste leur nom et tu met les notes ainsi que la distance stp
  // des domaines" — depuis la page globale, la villa/le domaine n'est connu qu'une fois choisi à
  // l'étape 1 : on prend la tranche d'options correspondant au domaine actuellement sélectionné.
  const effectiveMenageOptions = menageOptionsByDomaine ? (menageOptionsByDomaine[domaineId] ?? []) : menageOptions;
  const effectiveCuisineOptions = cuisineOptionsByDomaine ? (cuisineOptionsByDomaine[domaineId] ?? []) : cuisineOptions;

  // Date et heure en champs séparés plutôt qu'un seul <input type="datetime-local"> — Kamel,
  // 2026-09-15 : "on peux pas changer l'heure". Un datetime-local entièrement contrôlé par React
  // (value + onChange à chaque frappe) fait que Chrome réinitialise le segment heure/minute en
  // cours d'édition (il retombe sur l'heure actuelle) ; deux inputs simples type="date"/"time"
  // n'ont pas ce problème, et c'est d'ailleurs ce que fait Superhote (Arrivée / Heure d'arrivée).
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [nbAdultes, setNbAdultes] = useState("1");
  const [nbEnfants, setNbEnfants] = useState("0");

  // Type : client payant, ou blocage sans tarif (propriétaire sur place, travaux...) ou famille qui
  // ne paie que le ménage — Kamel, 2026-10-14 : "bloquer sans mettre de prix, par exemple quand le
  // proprio est là, quand y a des travaux, parfois c'est la famille qui paie que les frais de ménage".
  const [typeResa, setTypeResa] = useState<TypeResa>("client");
  const estClient = typeResa === "client";
  const estBlocage = typeResa === "proprietaire" || typeResa === "travaux" || typeResa === "autre";
  const [guestName, setGuestName] = useState("");
  const [indicatif, setIndicatif] = useState("+212");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const [loyerTotal, setLoyerTotal] = useState("");
  const [devisePaiement, setDevisePaiement] = useState<(typeof DEVISES)[number]>("EUR");
  const [moyenPaiement, setMoyenPaiement] = useState("");
  // Préremplis à l'initialisation pour la villa déjà connue (dialogue depuis la fiche villa) ;
  // mis à jour explicitement au choix du logement dans handleVillaChange pour la page globale, où
  // la villa n'est pas encore connue au premier rendu — jamais dans un useEffect (setState y
  // déclencherait un rendu en cascade évitable).
  const [caution, setCaution] = useState(() => (initialVillaId ? String(villaPriceDefaults?.[initialVillaId]?.caution ?? "") : ""));
  const [fraisMenage, setFraisMenage] = useState(() => (initialVillaId ? String(villaPriceDefaults?.[initialVillaId]?.menage ?? "") : ""));
  const [notes, setNotes] = useState("");
  // Prix PriceLabs + promo + suivi interne (avance, mode de règlement, remarque) — Kamel,
  // 2026-10-14 : réservations en direct prises par une partenaire.
  const [prixPl, setPrixPl] = useState<PrixSejour | null>(null);
  const [prixPlLoading, setPrixPlLoading] = useState(false);
  const [showNuits, setShowNuits] = useState(false);
  const [promoType, setPromoType] = useState<"aucune" | "pourcentage" | "montant">("aucune");
  const [promoValeur, setPromoValeur] = useState("");
  const [avanceVersee, setAvanceVersee] = useState("");
  const [modeReglement, setModeReglement] = useState<"" | "sur_place" | "virement">("");
  const [remarqueInterne, setRemarqueInterne] = useState("");
  const [shareToken, setShareToken] = useState<string | null>(null);
  // Le loyer n'est recalculé automatiquement tant qu'il n'a pas été modifié à la main.
  const [loyerManuel, setLoyerManuel] = useState(false);

  // Nuits déjà prises du logement choisi (réservations, Beds24 en direct, PriceLabs) — grisées
  // dans le calendrier et revérifiées côté serveur à la création.
  const [indispos, setIndispos] = useState<{ villaId: string; nuits: string[]; tempsReel: boolean } | null>(null);
  const indisposChargees = Boolean(villaId) && indispos?.villaId === villaId;
  const nuitsPrises = useMemo(() => new Set(indisposChargees ? indispos!.nuits : []), [indisposChargees, indispos]);

  useEffect(() => {
    if (!villaId) return;
    let annule = false;
    indisponibilitesAction(villaId)
      .then((res) => {
        if (!annule) setIndispos({ villaId, nuits: res.nuits, tempsReel: res.tempsReel });
      })
      .catch(() => {
        if (!annule) setIndispos({ villaId, nuits: [], tempsReel: false });
      });
    return () => {
      annule = true;
    };
  }, [villaId, step]);

  function appliquerPromo(base: number, type: typeof promoType, valeur: string): number {
    const v = Number(valeur.replace(",", "."));
    if (type === "aucune" || !Number.isFinite(v) || v <= 0) return Math.round(base * 100) / 100;
    const apres = type === "pourcentage" ? base * (1 - Math.min(v, 100) / 100) : base - v;
    return Math.max(0, Math.round(apres * 100) / 100);
  }

  function recalculerLoyer(base: number | null, type: typeof promoType, valeur: string) {
    if (base == null) return;
    setLoyerTotal(String(appliquerPromo(base, type, valeur)));
    setLoyerManuel(false);
  }

  function handleVillaChange(newVillaId: string) {
    setVillaId(newVillaId);
    setCheckInDate("");
    setCheckOutDate("");
    const defaults = villaPriceDefaults?.[newVillaId];
    if (defaults) {
      setCaution(String(defaults.caution));
      setFraisMenage(String(defaults.menage));
    }
  }

  function handleDomaineChange(newDomaineId: string) {
    setDomaineId(newDomaineId);
    setVillaId("");
    setCaution("");
    setFraisMenage("");
  }

  function composePhone() {
    if (indicatif === "autre") return phoneLocal.trim();
    const digits = phoneLocal.trim().replace(/^0+/, "");
    return digits ? `${indicatif}${digits}` : "";
  }

  // Réservations en direct uniquement : Airbnb et Booking.com arrivent par Beds24.
  const canalValue = "Direct";

  const villaStepIndex = showVillaStep ? 0 : -1;
  const sejourStepIndex = showVillaStep ? 1 : 0;
  const voyageurStepIndex = sejourStepIndex + 1;
  const prixStepIndex = voyageurStepIndex + 1;
  const personnelStepIndex = prixStepIndex + 1;

  const villaValid = Boolean(villaId);
  const sejourValid = Boolean(checkInDate && checkOutDate);
  const voyageurValid = !estClient || Boolean(guestName.trim());

  function handleNext() {
    if (step === villaStepIndex && !villaValid) {
      toast.error("Choisis un logement.");
      return;
    }
    if (step === sejourStepIndex && !sejourValid) {
      toast.error("Renseigne au moins l'arrivée et le départ.");
      return;
    }
    if (step === voyageurStepIndex && !voyageurValid) {
      toast.error("Le nom du client est obligatoire.");
      return;
    }
    // Loyer calculé depuis PriceLabs (somme des nuits) dès qu'on arrive sur l'étape Prix ; repli
    // sur le tarif/nuit connu de la villa si PriceLabs ne répond pas — Kamel, 2026-10-14 : "connecté
    // à PriceLabs directement, comme ça elle applique les prix PriceLabs + sa promo".
    if (step === voyageurStepIndex) {
      setPrixPl(null);
      if (estClient && villaId && checkInDate && checkOutDate) {
        setPrixPlLoading(true);
        calculerPrixSejourAction(villaId, checkInDate, checkOutDate)
          .then((res) => {
            setPrixPl(res);
            if (res.ok) {
              if (res.devise === "EUR" || res.devise === "MAD") setDevisePaiement(res.devise);
              if (!loyerManuel) setLoyerTotal(String(appliquerPromo(res.total, promoType, promoValeur)));
            } else if (!loyerTotal) {
              const prixNuit = villaPriceDefaults?.[villaId]?.prixNuit;
              const nights = differenceInCalendarDays(new Date(checkOutDate), new Date(checkInDate));
              if (prixNuit && nights > 0) setLoyerTotal(String(nights * prixNuit));
            }
          })
          .catch(() => setPrixPl({ ok: false, devise: "EUR", nuits: 0, total: 0, parNuit: [], source: null, message: "PriceLabs injoignable." }))
          .finally(() => setPrixPlLoading(false));
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleSubmit() {
    if (!villaValid || !sejourValid || !voyageurValid) return;
    const formData = new FormData();
    formData.set("villaId", villaId);
    formData.set("checkIn", `${checkInDate}T${checkInTime || "15:00"}`);
    formData.set("checkOut", `${checkOutDate}T${checkOutTime || "11:00"}`);
    formData.set("nbAdultes", nbAdultes);
    formData.set("nbEnfants", nbEnfants);
    formData.set("canal", canalValue);
    if (prixPl?.ok) formData.set("prixPricelabs", String(prixPl.total));
    formData.set("promoType", promoType === "aucune" ? "" : promoType);
    formData.set("promoValeur", promoType === "aucune" ? "" : promoValeur.trim());
    formData.set("avanceVersee", avanceVersee.trim());
    formData.set("modeReglement", modeReglement);
    formData.set("remarqueInterne", remarqueInterne.trim());
    formData.set("typeReservation", typeResa);
    formData.set("guestName", guestName.trim() || TYPES_RESA.find((t) => t.value === typeResa)!.nom);
    formData.set("guestPhone", composePhone());
    formData.set("guestEmail", guestEmail.trim());
    formData.set("loyerTotal", estClient ? loyerTotal.trim() : "");
    formData.set("devisePaiement", devisePaiement);
    formData.set("moyenPaiement", moyenPaiement);
    formData.set("caution", estClient ? caution.trim() : "");
    formData.set("fraisMenage", fraisMenage.trim());
    formData.set("notes", notes.trim());

    startTransition(async () => {
      try {
        const result = await createReservation(formData);
        toast.success("Réservation ajoutée.");
        setCreatedReservationId(result.id);
        setShareToken(result.token ?? null);
        setStep(personnelStepIndex);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  function handleFinish() {
    if (!createdReservationId) return;
    if (onCreated) onCreated(createdReservationId);
    else router.push(`/villas/${villaId}`);
  }

  // Barre de progression fine + halo doux façon "Apple Intelligence" — Kamel, 2026-09-15 :
  // premier essai jugé "pas propre" (contour dur, couleurs trop saturées, épais). Repris en halo
  // FLOUTÉ derrière une carte plate classique (bordure fine normale, fond opaque intact) plutôt
  // qu'un contour peint par-dessus : palette pastel douce (bleu/violet/rose/orange clairs),
  // fort flou (blur-2xl), faible opacité — la carte garde son look plat Stripe habituel, le halo
  // n'est qu'une lueur ambiante discrète qui tourne lentement derrière.
  const progressPercent = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="search-ring-spin pointer-events-none absolute inset-[-15%] rounded-3xl opacity-40 blur-2xl"
        style={{
          background: "conic-gradient(from 0deg, #93c5fd, #c4b5fd, #f9a8d4, #fdba74, #93c5fd)",
        }}
      />
      <div className="relative space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "border-2 border-primary text-primary"
                    : "border border-border text-muted-foreground"
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 ? <div className="h-px flex-1 bg-border" /> : null}
          </div>
        ))}
      </div>

      <div className="min-h-64 space-y-4">
        {step === villaStepIndex && villas ? (
          <div className="space-y-4">
            {domaines ? (
              <div className="space-y-1.5">
                <Label>Domaine</Label>
                <Select value={domaineId} onValueChange={handleDomaineChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un domaine" />
                  </SelectTrigger>
                  <SelectContent>
                    {domaines.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Logement</Label>
              <Select value={villaId} onValueChange={handleVillaChange} disabled={Boolean(domaines) && !domaineId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={domaines && !domaineId ? "Choisis d'abord un domaine" : "Choisir un logement"} />
                </SelectTrigger>
                <SelectContent>
                  {(villasDuDomaine ?? villas).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nom} (n°{v.numero})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === sejourStepIndex ? (
          <div className="space-y-4">
            {villaLabel ? <p className="text-sm text-muted-foreground">{villaLabel}</p> : null}
            {!indisposChargees ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Lecture du calendrier du logement...
              </p>
            ) : (
              <>
                <DisponibiliteCalendar
                  nuitsPrises={nuitsPrises}
                  arrivee={checkInDate}
                  depart={checkOutDate}
                  onChange={(a, d) => {
                    setCheckInDate(a);
                    setCheckOutDate(d);
                  }}
                />
                {!indispos?.tempsReel ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Calendrier Beds24 injoignable : seules les réservations de l&apos;app et PriceLabs sont prises en compte.
                  </p>
                ) : null}
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="checkInTime">Heure d&apos;arrivée</Label>
                <Input id="checkInTime" type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkOutTime">Heure de départ</Label>
                <Input id="checkOutTime" type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nbAdultes">Adultes</Label>
                <Input id="nbAdultes" type="number" min="0" value={nbAdultes} onChange={(e) => setNbAdultes(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nbEnfants">Enfants</Label>
                <Input id="nbEnfants" type="number" min="0" value={nbEnfants} onChange={(e) => setNbEnfants(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Le nombre d&apos;adultes sert pour la fiche gendarmerie (les enfants n&apos;y figurent pas).
            </p>
          </div>
        ) : null}

        {step === voyageurStepIndex ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type de réservation</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TYPES_RESA.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTypeResa(t.value)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-colors",
                      typeResa === t.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guestName">{estClient ? "Nom du client" : "Nom (optionnel)"}</Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={estClient ? "" : TYPES_RESA.find((t) => t.value === typeResa)!.nom}
                required={estClient}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guestPhone">Téléphone</Label>
              <div className="flex gap-2">
                <Select value={indicatif} onValueChange={setIndicatif}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+212">🇲🇦 +212</SelectItem>
                    <SelectItem value="+33">🇫🇷 +33</SelectItem>
                    <SelectItem value="+34">🇪🇸 +34</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="guestPhone"
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  placeholder={indicatif === "autre" ? "Numéro complet avec indicatif" : "Ex. 0661757246"}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guestEmail">Email (optionnel)</Label>
              <Input id="guestEmail" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            </div>
          </div>
        ) : null}

        {step === prixStepIndex && !estClient ? (
          <div className="space-y-4">
            <p className="rounded-lg border p-3 text-sm">
              {typeResa === "famille"
                ? "Aucun loyer : la famille ne paie que les frais de ménage. Les dates sont bloquées sur tous les canaux (Beds24, Airbnb, Booking.com)."
                : "Aucun tarif : le logement est simplement bloqué sur ces dates, sur tous les canaux (Beds24, Airbnb, Booking.com)."}
            </p>
            {typeResa === "famille" ? (
              <div className="space-y-1.5">
                <Label htmlFor="fraisMenageFamille">Frais de ménage de départ</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="fraisMenageFamille"
                    type="number"
                    step="0.01"
                    min="0"
                    value={fraisMenage}
                    onChange={(e) => setFraisMenage(e.target.value)}
                  />
                  <Select value={devisePaiement} onValueChange={(v) => setDevisePaiement(v as (typeof DEVISES)[number])}>
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVISES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="notes">{estBlocage ? "Motif / remarque" : "Remarque"}</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={typeResa === "travaux" ? "Ex. Réfection de la piscine" : "Ex. Le propriétaire est là avec sa famille"}
              />
            </div>
          </div>
        ) : null}

        {step === prixStepIndex && estClient ? (
          <div className="space-y-4">
            {/* Tarif PriceLabs du séjour (somme des nuits) */}
            <div className="rounded-lg border p-3 text-sm">
              {prixPlLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calcul du prix PriceLabs...
                </p>
              ) : prixPl?.ok ? (
                <div className="space-y-1.5">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">Tarif PriceLabs · {prixPl.nuits} nuit{prixPl.nuits > 1 ? "s" : ""}</span>
                    <span className="text-base font-semibold">
                      {prixPl.total} {prixPl.devise}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Moyenne {Math.round((prixPl.total / prixPl.nuits) * 100) / 100} {prixPl.devise} / nuit
                    {prixPl.source === "cache" ? " · prix en cache (moins de 2 h)" : ""}
                    {" · "}
                    <button type="button" className="underline underline-offset-2" onClick={() => setShowNuits((v) => !v)}>
                      {showNuits ? "masquer le détail" : "voir le détail"}
                    </button>
                  </p>
                  {showNuits ? (
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {prixPl.parNuit.map((n) => (
                        <li key={n.date} className="flex justify-between">
                          <span>{n.date.slice(8, 10)}/{n.date.slice(5, 7)}</span>
                          <span>{n.prix}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {prixPl?.message ?? "Prix PriceLabs indisponibles"} — saisis le loyer à la main.
                </p>
              )}
            </div>

            {/* Promotion */}
            <div className="space-y-1.5">
              <Label>Promotion</Label>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <Select
                  value={promoType}
                  onValueChange={(v) => {
                    const t = v as typeof promoType;
                    setPromoType(t);
                    if (t === "aucune") setPromoValeur("");
                    if (prixPl?.ok) recalculerLoyer(prixPl.total, t, t === "aucune" ? "" : promoValeur);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aucune">Aucune</SelectItem>
                    <SelectItem value="pourcentage">En pourcentage (%)</SelectItem>
                    <SelectItem value="montant">Somme ({devisePaiement})</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={promoType === "aucune"}
                  placeholder={promoType === "pourcentage" ? "Ex. 10" : "Ex. 200"}
                  value={promoValeur}
                  onChange={(e) => {
                    setPromoValeur(e.target.value);
                    if (prixPl?.ok) recalculerLoyer(prixPl.total, promoType, e.target.value);
                  }}
                />
              </div>
              {prixPl?.ok && promoType !== "aucune" && Number(promoValeur) > 0 ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {prixPl.total} {prixPl.devise} → {appliquerPromo(prixPl.total, promoType, promoValeur)} {prixPl.devise}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="loyerTotal">Loyer total</Label>
                <Input
                  id="loyerTotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={loyerTotal}
                  onChange={(e) => {
                    setLoyerTotal(e.target.value);
                    setLoyerManuel(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Devise</Label>
                <Select value={devisePaiement} onValueChange={(v) => setDevisePaiement(v as (typeof DEVISES)[number])}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVISES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Suivi de l'encaissement */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="avanceVersee">Avance déjà versée</Label>
                <Input id="avanceVersee" type="number" step="0.01" min="0" value={avanceVersee} onChange={(e) => setAvanceVersee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reste à récupérer</Label>
                <Select value={modeReglement} onValueChange={(v) => setModeReglement(v as typeof modeReglement)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sur place / virement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sur_place">Sur place</SelectItem>
                    <SelectItem value="virement">Par virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {Number(loyerTotal) > 0 ? (
              <p className="text-sm font-medium">
                Reste à encaisser : {Math.max(0, Math.round((Number(loyerTotal) - (Number(avanceVersee) || 0)) * 100) / 100)} {devisePaiement}
                {modeReglement === "sur_place" ? " (sur place)" : modeReglement === "virement" ? " (par virement)" : ""}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="remarqueInterne">Remarque interne (pas visible sur le lien)</Label>
              <Textarea
                id="remarqueInterne"
                rows={2}
                value={remarqueInterne}
                onChange={(e) => setRemarqueInterne(e.target.value)}
                placeholder="Ex. Elle a déjà envoyé 200 € d'avance, on récupère 500 € sur place à l'arrivée"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Moyen de paiement</Label>
              <Select value={moyenPaiement} onValueChange={setMoyenPaiement}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  {MOYENS_PAIEMENT.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="caution">Caution</Label>
                <Input id="caution" type="number" step="0.01" min="0" value={caution} onChange={(e) => setCaution(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fraisMenage">Frais de ménage de départ</Label>
                <Input id="fraisMenage" type="number" step="0.01" min="0" value={fraisMenage} onChange={(e) => setFraisMenage(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Demandes particulières</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. Prévoir une cuisinière" />
            </div>
          </div>
        ) : null}

        {step === personnelStepIndex && createdReservationId ? (
          <div className="space-y-4">
            {shareToken ? <ShareRecapCard token={shareToken} guestName={guestName} /> : null}
            {!shareToken && estBlocage ? (
              <p className="rounded-lg border p-3 text-sm">Dates bloquées sur le calendrier, sur tous les canaux.</p>
            ) : null}
            {showPersonnelStep && !estBlocage ? (
              <>
                <p className="text-xs text-muted-foreground">Affecte le personnel si tu le connais déjà (facultatif).</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {menageOptions || menageOptionsByDomaine ? (
                    <PersonnelAffectationEditor
                      reservationId={createdReservationId}
                      role="menage"
                      moment="depart"
                      label="Ménage"
                      assigned={menageAssigned}
                      onAssignedChange={setMenageAssigned}
                      options={effectiveMenageOptions ?? []}
                      minimal
                    />
                  ) : null}
                  {cuisineOptions || cuisineOptionsByDomaine ? (
                    <PersonnelAffectationEditor
                      reservationId={createdReservationId}
                      role="cuisine"
                      label="Cuisine"
                      assigned={cuisineAssigned}
                      onAssignedChange={setCuisineAssigned}
                      options={effectiveCuisineOptions ?? []}
                      minimal
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0 || step === personnelStepIndex}
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
        >
          Précédent
        </Button>
        {step === personnelStepIndex ? (
          <Button type="button" onClick={handleFinish}>
            Terminé
          </Button>
        ) : step < prixStepIndex ? (
          <Button type="button" onClick={handleNext}>
            Suivant
          </Button>
        ) : (
          <Button type="button" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "Ajout..." : "Créer la réservation"}
          </Button>
        )}
        </div>
      </div>
    </div>
  );
}

// Lien de partage du récapitulatif (page publique /s/[token]) : copier, ou l'envoyer par WhatsApp
// à la partenaire, à nous ou à la cliente.
function ShareRecapCard({ token, guestName }: { token: string; guestName: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : `/s/${token}`;
  const texte = `Récapitulatif de la réservation de ${guestName} : ${url}`;
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-medium">Réservation créée — lien de partage</p>
      <p className="break-all rounded-md border bg-background px-2 py-1.5 text-xs">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard
              .writeText(url)
              .then(() => toast.success("Lien copié."))
              .catch(() => toast.error("Copie impossible, sélectionne le lien."));
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copier le lien
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Envoyer par WhatsApp
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Le lien montre le séjour, le tarif, la promo, l&apos;avance et le reste à régler. La remarque interne n&apos;y figure pas.</p>
    </div>
  );
}
