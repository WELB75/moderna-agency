"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";

// Assistant en plusieurs étapes plutôt qu'un formulaire géant façon Superhote — Kamel,
// 2026-09-14 : "je veux un truc simple avec les infos principal et surtout un système pas avec
// tout d'un coup, on valide qq points ensuite on avance etc". Contenu partagé entre le dialogue
// (villa déjà connue, depuis la fiche villa) et la page dédiée "/reservations/nouvelle" (villa à
// choisir, accessible directement depuis la nav) — voir add-reservation-dialog.tsx.
const STEPS_WITH_VILLA = ["Logement", "Séjour", "Voyageur", "Prix"] as const;
const STEPS_NO_VILLA = ["Séjour", "Voyageur", "Prix"] as const;

const DEVISES = ["EUR", "MAD"] as const;
const MOYENS_PAIEMENT = [
  { value: "especes", label: "Espèces" },
  { value: "virement", label: "Virement" },
  { value: "carte", label: "Carte" },
] as const;

export function AddReservationWizard({
  villas,
  initialVillaId,
  villaLabel,
  onCreated,
}: {
  // Fourni depuis la page globale : la première étape propose de choisir la villa.
  villas?: { id: string; nom: string; numero: string }[];
  // Fourni depuis la fiche villa : villa déjà fixée, pas de sélecteur à afficher.
  initialVillaId?: string;
  villaLabel?: string;
  onCreated?: (reservationId: string) => void;
}) {
  const showVillaStep = !initialVillaId && Boolean(villas);
  const STEPS = showVillaStep ? STEPS_WITH_VILLA : STEPS_NO_VILLA;
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  const [villaId, setVillaId] = useState(initialVillaId ?? "");

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
  const [notes, setNotes] = useState("");

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
    formData.set("notes", notes.trim());

    startTransition(async () => {
      try {
        const result = await createReservation(formData);
        toast.success("Réservation ajoutée.");
        if (onCreated) onCreated(result.id);
        else router.push(`/villas/${villaId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
      }
    });
  }

  return (
    <div className="space-y-4">
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
            <div className="space-y-1.5">
              <Label>Logement</Label>
              <Select value={villaId} onValueChange={setVillaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un logement" />
                </SelectTrigger>
                <SelectContent>
                  {villas.map((v) => (
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
            <div className="space-y-1.5">
              <Label htmlFor="notes">Demandes particulières</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. Prévoir une cuisinière" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(s - 1, 0))}>
          Précédent
        </Button>
        {step < STEPS.length - 1 ? (
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
  );
}
