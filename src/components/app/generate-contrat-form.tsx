"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
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
};

export function GenerateContratForm({
  domaines,
  villas,
  reservations,
}: {
  domaines: LieuDomaine[];
  villas: LieuVilla[];
  reservations?: ContratReservation[];
}) {
  const [domaineId, setDomaineId] = useState("");
  const [villaId, setVillaId] = useState("");
  const [agenceRepresentant, setAgenceRepresentant] = useState(AGENCE_REPRESENTANT_DEFAUT);
  const [locataireNom, setLocataireNom] = useState("");
  const [locataireAdresse, setLocataireAdresse] = useState("");
  const [nbAdultes, setNbAdultes] = useState("1");
  const [nbEnfants, setNbEnfants] = useState("0");
  const [dateArrivee, setDateArrivee] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [devise, setDevise] = useState("DH");
  const [montantTotal, setMontantTotal] = useState("");
  const [acompteMontant, setAcompteMontant] = useState("");
  const [soldeMontant, setSoldeMontant] = useState("");
  const [soldeDateLimite, setSoldeDateLimite] = useState("");
  const [depotGarantieMontant, setDepotGarantieMontant] = useState("");
  const [depotRestitutionDate, setDepotRestitutionDate] = useState("");
  const [lieuSignature, setLieuSignature] = useState("Marrakech");
  const [avecFichePolice, setAvecFichePolice] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignaturePadHandle>(null);

  const villaReservations = villaId ? (reservations ?? []).filter((r) => r.villaId === villaId) : [];

  // Pré-remplit depuis une réservation Superhote existante plutôt que de tout retaper : reste
  // modifiable ensuite (l'adresse du locataire ou l'acompte exact ne viennent pas de Superhote).
  function applyReservation(reservationId: string) {
    const r = villaReservations.find((res) => res.id === reservationId);
    if (!r) return;
    setLocataireNom(r.guestName);
    if (r.nbAdultes) setNbAdultes(String(r.nbAdultes));
    if (r.nbEnfants !== null) setNbEnfants(String(r.nbEnfants));
    setDateArrivee(format(new Date(r.checkIn), "yyyy-MM-dd"));
    setDateDepart(format(new Date(r.checkOut), "yyyy-MM-dd"));
    if (["DH", "EUR", "USD", "GBP"].includes(r.devisePaiement)) setDevise(r.devisePaiement);
    if (r.loyerTotal) {
      const total = Number(r.loyerTotal);
      const paye = Number(r.montantPaye ?? 0);
      setMontantTotal(r.loyerTotal);
      setAcompteMontant(r.montantPaye ?? "");
      setSoldeMontant(Math.max(0, total - paye).toFixed(2));
    }
    if (r.caution) setDepotGarantieMontant(r.caution);
    toast.success("Champs pré-remplis depuis la réservation — vérifie avant de générer.");
  }

  function handleGenerate() {
    if (!villaId) {
      toast.error("Choisis une villa ou un appartement.");
      return;
    }
    if (sigRef.current?.isEmpty()) {
      toast.error("Signe pour l'Agence avant de générer le lien.");
      return;
    }
    const signatureAgenceImage = sigRef.current!.toDataUrl();
    startTransition(async () => {
      try {
        const input = {
          villaId,
          agenceRepresentant,
          locataireNom,
          locataireAdresse,
          nbAdultes: Number(nbAdultes) || 1,
          nbEnfants: Number(nbEnfants) || 0,
          dateArrivee,
          dateDepart,
          devise,
          montantTotal,
          acompteMontant,
          soldeMontant,
          soldeDateLimite,
          depotGarantieMontant,
          depotRestitutionDate,
          lieuSignature,
          dateSignatureAgence: format(new Date(), "dd/MM/yyyy"),
          signatureAgenceImage,
        };
        if (avecFichePolice) {
          const contrat = await generateDossier(input);
          setGeneratedLink(`${window.location.origin}/dossier/${contrat.id}`);
          toast.success("Dossier créé (contrat + fiche police).");
        } else {
          const contrat = await generateContrat(input);
          setGeneratedLink(`${window.location.origin}/c/${contrat.id}`);
          toast.success("Contrat créé.");
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
        <p className="text-sm text-muted-foreground">
          Un seul lien par famille : la personne qui signe engage tout le groupe.
        </p>
        <LieuVillaSelect
          domaines={domaines}
          villas={villas}
          domaineId={domaineId}
          villaId={villaId}
          onDomaineChange={setDomaineId}
          onVillaChange={setVillaId}
        />
        {villaId && villaReservations.length > 0 ? (
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <Label>Pré-remplir depuis une réservation (optionnel)</Label>
            <Select value="" onValueChange={applyReservation}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir une réservation Superhote..." />
              </SelectTrigger>
              <SelectContent>
                {villaReservations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.guestName} · {format(new Date(r.checkIn), "d MMM")} → {format(new Date(r.checkOut), "d MMM yyyy")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nom du locataire</Label>
            <Input value={locataireNom} onChange={(e) => setLocataireNom(e.target.value)} placeholder="Ex. Salom Ennhaili" />
          </div>
          <div className="space-y-1.5">
            <Label>Adresse du locataire</Label>
            <Input value={locataireAdresse} onChange={(e) => setLocataireAdresse(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </div>
        <div className="space-y-1.5 max-w-[140px]">
          <Label>Devise</Label>
          <Select value={devise} onValueChange={setDevise}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DH">DH (dirham)</SelectItem>
              <SelectItem value="EUR">EUR (euro)</SelectItem>
              <SelectItem value="USD">USD (dollar)</SelectItem>
              <SelectItem value="GBP">GBP (livre)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Montant total</Label>
            <Input value={montantTotal} onChange={(e) => setMontantTotal(e.target.value)} placeholder="Ex. 1560" />
          </div>
          <div className="space-y-1.5">
            <Label>Acompte</Label>
            <Input value={acompteMontant} onChange={(e) => setAcompteMontant(e.target.value)} placeholder="Ex. 300" />
          </div>
          <div className="space-y-1.5">
            <Label>Solde</Label>
            <Input value={soldeMontant} onChange={(e) => setSoldeMontant(e.target.value)} placeholder="Ex. 1260" />
          </div>
          <div className="space-y-1.5">
            <Label>Solde à verser avant le</Label>
            <Input type="date" value={soldeDateLimite} onChange={(e) => setSoldeDateLimite(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Dépôt de garantie</Label>
            <Input value={depotGarantieMontant} onChange={(e) => setDepotGarantieMontant(e.target.value)} placeholder="Ex. 950" />
          </div>
          <div className="space-y-1.5">
            <Label>Restitution de la caution le</Label>
            <Input type="date" value={depotRestitutionDate} onChange={(e) => setDepotRestitutionDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Représentant de l&apos;Agence</Label>
            <Input value={agenceRepresentant} onChange={(e) => setAgenceRepresentant(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fait à</Label>
            <Input value={lieuSignature} onChange={(e) => setLieuSignature(e.target.value)} />
          </div>
        </div>

        <SignaturePad ref={sigRef} label="Signature de l'Agence" clearLabel="Effacer" />

        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="avecFichePolice"
            checked={avecFichePolice}
            onCheckedChange={(v) => setAvecFichePolice(v === true)}
          />
          <Label htmlFor="avecFichePolice" className="font-normal">
            Inclure la fiche police dans le même lien (1 par adulte — le client remplit son identité
            puis signe le contrat, en une seule visite)
          </Label>
        </div>

        <Button type="button" disabled={isPending} onClick={handleGenerate}>
          <FileSignature className="h-4 w-4" />
          {isPending ? "Génération..." : avecFichePolice ? "Générer le dossier" : "Générer le lien"}
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
