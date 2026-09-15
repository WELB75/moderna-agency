"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { Check } from "lucide-react";
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
import { PLATFORMS, PlatformIcon, type PlatformKey } from "@/components/app/platform-badge";
import { createReservation } from "@/lib/actions/reservations";
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
  const STEPS = [...(showVillaStep ? STEPS_WITH_VILLA : STEPS_NO_VILLA), ...(showPersonnelStep ? (["Personnel"] as const) : [])];
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

  const [platform, setPlatform] = useState<PlatformKey>("direct");
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

  function handleVillaChange(newVillaId: string) {
    setVillaId(newVillaId);
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

  const canalValue = platform === "direct" ? "Direct" : PLATFORMS.find((p) => p.key === platform)!.label;

  const villaStepIndex = showVillaStep ? 0 : -1;
  const sejourStepIndex = showVillaStep ? 1 : 0;
  const voyageurStepIndex = sejourStepIndex + 1;
  const prixStepIndex = voyageurStepIndex + 1;
  const personnelStepIndex = showPersonnelStep ? prixStepIndex + 1 : -1;

  const villaValid = Boolean(villaId);
  const sejourValid = Boolean(checkInDate && checkOutDate);
  const voyageurValid = Boolean(guestName.trim());

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
    // Loyer total calculé depuis le tarif/nuit connu de la villa (voir villaPriceDefaults) dès
    // qu'on arrive sur l'étape Prix — Kamel, 2026-09-15 : "le loyer total peut pas etre calculer
    // par rapport au donné que l'on a sur le bien ?". Seulement si le champ est encore vide, pour
    // ne jamais écraser une valeur déjà saisie (ex. retour en arrière puis re-avance).
    if (step === voyageurStepIndex && !loyerTotal) {
      const prixNuit = villaPriceDefaults?.[villaId]?.prixNuit;
      if (prixNuit && checkInDate && checkOutDate) {
        const nights = differenceInCalendarDays(new Date(checkOutDate), new Date(checkInDate));
        if (nights > 0) setLoyerTotal(String(nights * prixNuit));
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
    formData.set("guestName", guestName);
    formData.set("guestPhone", composePhone());
    formData.set("guestEmail", guestEmail.trim());
    formData.set("loyerTotal", loyerTotal.trim());
    formData.set("devisePaiement", devisePaiement);
    formData.set("moyenPaiement", moyenPaiement);
    formData.set("caution", caution.trim());
    formData.set("fraisMenage", fraisMenage.trim());
    formData.set("notes", notes.trim());

    startTransition(async () => {
      try {
        const result = await createReservation(formData);
        toast.success("Réservation ajoutée.");
        if (showPersonnelStep) {
          setCreatedReservationId(result.id);
          setStep(personnelStepIndex);
        } else if (onCreated) {
          onCreated(result.id);
        } else {
          router.push(`/villas/${villaId}`);
        }
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
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="checkInDate">Arrivée</Label>
                <Input id="checkInDate" type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkInTime">Heure</Label>
                <Input id="checkInTime" type="time" className="w-24" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="checkOutDate">Départ</Label>
                <Input id="checkOutDate" type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkOutTime">Heure</Label>
                <Input id="checkOutTime" type="time" className="w-24" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
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
              <Label>Plateforme</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlatform(p.key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
                      platform === p.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: p.color || "var(--primary)" }}
                    >
                      <PlatformIcon platform={p.key} className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-medium">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guestName">Nom du client</Label>
              <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
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

        {step === prixStepIndex ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Facultatif — tu peux aussi le renseigner plus tard depuis la fiche.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="loyerTotal">Loyer total</Label>
                <Input id="loyerTotal" type="number" step="0.01" min="0" value={loyerTotal} onChange={(e) => setLoyerTotal(e.target.value)} />
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
            <p className="text-xs text-muted-foreground">Réservation créée — affecte le personnel si tu le connais déjà (facultatif).</p>
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
