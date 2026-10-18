"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Copy, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LieuVillaSelect, type LieuDomaine, type LieuVilla } from "@/components/app/lieu-villa-select";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { generateContrat, generateDossier } from "@/lib/actions/contrats";
import { AGENCE_REPRESENTANT_DEFAUT } from "@/lib/contrat-template";
import { plateformeDe } from "@/lib/conditions-sejour";

export type ContratReservation = {
  id: string;
  villaId: string | null;
  guestName: string;
  checkIn: string | Date;
  checkOut: string | Date;
  nbAdultes: number | null;
  nbEnfants: number | null;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  devisePaiement: string;
  canal: string | null;
};

const DEVISES = ["EUR", "DH", "USD", "GBP"];

function nombre(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Conditions de séjour à faire signer hors fiche police automatique — surtout pour une
// réservation directe (prix, acompte, solde). Pour Airbnb/Booking.com, la fiche police envoyée
// par Beds24 fait déjà signer les conditions : ce formulaire ne sert qu'en cas particulier.
export function GenerateContratForm({
  domaines,
  villas,
  reservations,
  defaultVillaId,
  defaultReservationId,
  signatureAgenceEnregistree = false,
}: {
  domaines: LieuDomaine[];
  villas: LieuVilla[];
  reservations?: ContratReservation[];
  // Pré-sélection venue d'ailleurs dans l'app (chip "Contrat" d'une réservation sans contrat).
  defaultVillaId?: string;
  defaultReservationId?: string;
  // Une signature de l'agence existe déjà en base : réutilisée, plus besoin de la redessiner.
  signatureAgenceEnregistree?: boolean;
}) {
  const liste = reservations ?? [];
  const [initiale] = useState(() => (defaultReservationId ? liste.find((r) => r.id === defaultReservationId) : undefined));
  const villaInitiale = villas.find((v) => v.id === (initiale?.villaId ?? defaultVillaId));

  const [reservationId, setReservationId] = useState(initiale?.id ?? "");
  const [domaineId, setDomaineId] = useState(villaInitiale?.domaineId ?? "");
  const [villaId, setVillaId] = useState(villaInitiale?.id ?? "");
  const [locataireNom, setLocataireNom] = useState(initiale?.guestName ?? "");
  const [nbAdultes, setNbAdultes] = useState(initiale?.nbAdultes ? String(initiale.nbAdultes) : "1");
  const [nbEnfants, setNbEnfants] = useState(initiale?.nbEnfants != null ? String(initiale.nbEnfants) : "0");
  const [dateArrivee, setDateArrivee] = useState(initiale ? format(new Date(initiale.checkIn), "yyyy-MM-dd") : "");
  const [dateDepart, setDateDepart] = useState(initiale ? format(new Date(initiale.checkOut), "yyyy-MM-dd") : "");
  const [devise, setDevise] = useState(initiale && DEVISES.includes(initiale.devisePaiement) ? initiale.devisePaiement : "EUR");
  const [montantTotal, setMontantTotal] = useState(initiale?.loyerTotal ?? "");
  const [acompteMontant, setAcompteMontant] = useState(initiale?.loyerTotal ? (initiale.montantPaye ?? "") : "");
  const [soldeDateLimite, setSoldeDateLimite] = useState("");
  const [caution, setCaution] = useState(initiale?.caution ?? "");
  const [avecFichePolice, setAvecFichePolice] = useState(true);
  const [resigner, setResigner] = useState(!signatureAgenceEnregistree);
  const [generatedLink, setGeneratedLink] = useState("");
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignaturePadHandle>(null);

  const reservation = liste.find((r) => r.id === reservationId);
  const plateforme = plateformeDe(reservation?.canal);
  const solde = montantTotal.trim() ? Math.max(0, nombre(montantTotal) - nombre(acompteMontant)) : 0;

  function choisirReservation(id: string) {
    const r = liste.find((res) => res.id === id);
    if (!r) return;
    setReservationId(r.id);
    const villa = villas.find((v) => v.id === r.villaId);
    if (villa) {
      setVillaId(villa.id);
      setDomaineId(villa.domaineId ?? "");
    }
    setLocataireNom(r.guestName);
    setNbAdultes(r.nbAdultes ? String(r.nbAdultes) : "1");
    setNbEnfants(r.nbEnfants != null ? String(r.nbEnfants) : "0");
    setDateArrivee(format(new Date(r.checkIn), "yyyy-MM-dd"));
    setDateDepart(format(new Date(r.checkOut), "yyyy-MM-dd"));
    if (DEVISES.includes(r.devisePaiement)) setDevise(r.devisePaiement);
    setMontantTotal(r.loyerTotal ?? "");
    setAcompteMontant(r.loyerTotal ? (r.montantPaye ?? "") : "");
    setCaution(r.caution ?? "");
    setGeneratedLink("");
  }

  function handleGenerate() {
    if (!villaId) {
      toast.error("Choisis une réservation, ou une villa / un appartement.");
      return;
    }
    let signatureAgenceImage = "";
    if (resigner) {
      if (sigRef.current?.isEmpty()) {
        toast.error("Signe pour l'Agence avant de générer le lien.");
        return;
      }
      signatureAgenceImage = sigRef.current!.toDataUrl();
    }
    startTransition(async () => {
      try {
        const input = {
          villaId,
          reservationId: reservationId || undefined,
          agenceRepresentant: AGENCE_REPRESENTANT_DEFAUT,
          locataireNom,
          locataireAdresse: "",
          nbAdultes: Number(nbAdultes) || 1,
          nbEnfants: Number(nbEnfants) || 0,
          dateArrivee,
          dateDepart,
          devise,
          // Réservation plateforme : prix et annulation sont ceux de la plateforme, rien à saisir.
          montantTotal: plateforme ? "" : montantTotal,
          acompteMontant: plateforme ? "" : acompteMontant,
          soldeMontant: plateforme || !montantTotal.trim() ? "" : solde.toFixed(2),
          soldeDateLimite: plateforme ? "" : soldeDateLimite,
          depotGarantieMontant: caution,
          depotRestitutionDate: "",
          lieuSignature: "Marrakech",
          dateSignatureAgence: format(new Date(), "dd/MM/yyyy"),
          signatureAgenceImage,
        };
        if (avecFichePolice) {
          const { lien } = await generateDossier(input);
          setGeneratedLink(`${window.location.origin}${lien}`);
          toast.success(lien.startsWith("/c/") ? "Fiche police déjà remplie : lien des conditions seules." : "Lien créé (fiche police + conditions).");
        } else {
          const contrat = await generateContrat(input);
          setGeneratedLink(`${window.location.origin}/c/${contrat.id}`);
          toast.success("Lien des conditions créé.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(generatedLink);
    toast.success("Lien copié.");
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label>Réservation</Label>
          <Select value={reservationId} onValueChange={choisirReservation}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir la réservation (pré-remplit tout)" />
            </SelectTrigger>
            <SelectContent>
              {liste.map((r) => {
                const villa = villas.find((v) => v.id === r.villaId);
                return (
                  <SelectItem key={r.id} value={r.id}>
                    {villa?.nom ?? "Logement"} · {r.guestName} · {format(new Date(r.checkIn), "d MMM", { locale: fr })} →{" "}
                    {format(new Date(r.checkOut), "d MMM", { locale: fr })}
                    {r.canal ? ` · ${r.canal}` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sans réservation dans la liste, choisis simplement le logement ci-dessous.
          </p>
        </div>

        <LieuVillaSelect
          domaines={domaines}
          villas={villas}
          domaineId={domaineId}
          villaId={villaId}
          onDomaineChange={setDomaineId}
          onVillaChange={setVillaId}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Nom du locataire</Label>
            <Input value={locataireNom} onChange={(e) => setLocataireNom(e.target.value)} placeholder="Ex. Salom Ennhaili" />
          </div>
          <div className="space-y-1.5">
            <Label>Adultes</Label>
            <Input type="number" min={1} value={nbAdultes} onChange={(e) => setNbAdultes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Enfants</Label>
            <Input type="number" min={0} value={nbEnfants} onChange={(e) => setNbEnfants(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Arrivée</Label>
            <Input type="date" value={dateArrivee} onChange={(e) => setDateArrivee(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Départ</Label>
            <Input type="date" value={dateDepart} onChange={(e) => setDateDepart(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Caution (laisser vide si aucune)</Label>
            <Input value={caution} onChange={(e) => setCaution(e.target.value)} placeholder="Ex. 1000" />
          </div>
        </div>

        {plateforme ? (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Réservation {plateforme} : le prix, le paiement et l&apos;annulation sont ceux de {plateforme}, rien à saisir.
          </p>
        ) : (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Paiement (réservation directe)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Devise</Label>
                <Select value={devise} onValueChange={setDevise}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (euro)</SelectItem>
                    <SelectItem value="DH">DH (dirham)</SelectItem>
                    <SelectItem value="USD">USD (dollar)</SelectItem>
                    <SelectItem value="GBP">GBP (livre)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prix total</Label>
                <Input value={montantTotal} onChange={(e) => setMontantTotal(e.target.value)} placeholder="Ex. 1560" />
              </div>
              <div className="space-y-1.5">
                <Label>Acompte versé</Label>
                <Input value={acompteMontant} onChange={(e) => setAcompteMontant(e.target.value)} placeholder="Ex. 300" />
              </div>
              <div className="space-y-1.5">
                <Label>Solde avant le</Label>
                <Input type="date" value={soldeDateLimite} onChange={(e) => setSoldeDateLimite(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {montantTotal.trim()
                ? `Solde calculé : ${solde.toFixed(2)} ${devise}${soldeDateLimite ? "" : " · à régler avant l'arrivée"}.`
                : "Sans prix total, les conditions indiquent « prix convenu lors de la réservation »."}
            </p>
          </div>
        )}

        {resigner ? (
          <SignaturePad ref={sigRef} label="Signature de l'Agence" clearLabel="Effacer" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Signature de l&apos;Agence : la signature enregistrée est utilisée.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResigner(true)}>
              Signer à nouveau
            </Button>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="avecFichePolice"
            checked={avecFichePolice}
            onCheckedChange={(v) => setAvecFichePolice(v === true)}
          />
          <Label htmlFor="avecFichePolice" className="font-normal">
            Inclure la fiche police dans le même lien (recommandé) — le client remplit l&apos;identité de tout le groupe
            puis signe les conditions, en une seule visite.
          </Label>
        </div>

        <Button type="button" disabled={isPending} onClick={handleGenerate}>
          <FileSignature className="h-4 w-4" />
          {isPending ? "Génération..." : "Générer le lien"}
        </Button>

        {generatedLink ? (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
            <p className="min-w-0 flex-1 truncate text-sm">{generatedLink}</p>
            <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" />
              Copier
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
