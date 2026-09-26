"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { addDays, format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, RefreshCw, Search } from "lucide-react";
import type { TarificationVilla } from "@/lib/pricelabs/sync";

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
        <div className="space-y-4">
          {villasFiltrees.map((v) => (
            <VillaTarifCard key={v.id} villa={v} />
          ))}
        </div>
      )}
    </div>
  );
}

type DevisResultat = { erreur: string } | { nuits: number; total: number };

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
    if (finDate <= debutDate) return { erreur: "La date de fin doit être après la date de début." };

    const nuits: number[] = [];
    let manquantes = 0;
    let indisponibles = 0;
    for (let cursor = debutDate; cursor < finDate; cursor = addDays(cursor, 1)) {
      const jour = villa.days.find((d) => d.date === format(cursor, "yyyy-MM-dd"));
      if (!jour) manquantes++;
      else if (jour.unbookable || jour.price == null) indisponibles++;
      else nuits.push(jour.price);
    }
    if (manquantes > 0) return { erreur: "Période hors du calendrier de prix disponible (60 jours)." };
    if (indisponibles > 0) return { erreur: `${indisponibles} nuit(s) déjà réservée(s) sur cette période.` };

    return { nuits: nuits.length, total: nuits.reduce((s, p) => s + p, 0) };
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
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            Prix ce soir —{" "}
            {prixCeSoir && !prixCeSoir.unbookable && prixCeSoir.price != null ? (
              <span className="font-semibold">{formatPrix(prixCeSoir.price, villa.currency)}</span>
            ) : (
              <span className="text-muted-foreground">indisponible ce soir</span>
            )}
          </div>
        ) : null}

        {devis ? (
          "erreur" in devis ? (
            <p className="text-sm text-destructive">{devis.erreur}</p>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{devis.nuits} nuit(s)</span>
              <span className="text-base font-semibold">{formatPrix(devis.total, villa!.currency)}</span>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function VillaTarifCard({ villa }: { villa: TarificationVilla }) {
  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center gap-3 pt-6">
        {villa.photoUrl ? (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
            <Image src={villa.photoUrl} alt="" fill sizes="56px" className="object-cover" />
          </div>
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{villa.nom}</CardTitle>
            {villa.domaineNom ? (
              <Badge variant="outline" className="text-xs">
                {villa.domaineNom}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {villa.type === "appartement" ? "Appartement" : "Villa"} n°{villa.numero}
          </p>
        </div>
        {!villa.error && (villa.minPrice != null || villa.basePrice != null || villa.maxPrice != null) ? (
          <div className="hidden flex-wrap gap-1.5 sm:flex">
            {villa.minPrice != null ? <Badge variant="outline">Min {formatPrix(villa.minPrice, villa.currency)}</Badge> : null}
            {villa.basePrice != null ? <Badge variant="secondary">Base {formatPrix(villa.basePrice, villa.currency)}</Badge> : null}
            {villa.maxPrice != null ? <Badge variant="outline">Max {formatPrix(villa.maxPrice, villa.currency)}</Badge> : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pb-6">
        {villa.error ? (
          <p className="text-sm text-destructive">Prix temporairement indisponibles, réessayez plus tard.</p>
        ) : villa.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pas encore de calendrier de prix pour cette villa.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {villa.days.map((d) => (
              <div
                key={d.date}
                className={`flex w-16 shrink-0 flex-col items-center rounded-md border px-1.5 py-2 text-center ${
                  d.unbookable ? "border-border bg-muted/50 text-muted-foreground" : "border-border"
                }`}
              >
                <span className="text-[11px] text-muted-foreground capitalize">{format(parseISO(d.date), "EEE d MMM", { locale: fr })}</span>
                <span className={`mt-1 text-sm font-medium ${d.unbookable ? "text-muted-foreground line-through" : ""}`}>
                  {d.unbookable || d.price == null ? "—" : formatPrix(d.price, villa.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatPrix(montant: number, currency: string | null): string {
  return `${Math.round(montant)} ${currency ?? ""}`.trim();
}
