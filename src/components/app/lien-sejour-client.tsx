"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LienClientButton } from "@/components/app/lien-client-button";
import { plateformeDe } from "@/lib/conditions-sejour";
import { cn } from "@/lib/utils";

export type SejourLien = {
  id: string;
  villaNom: string;
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
  ficheId: string | null;
  ficheStatut: "complete" | "en_attente" | null;
  contratStatut: "signe" | "en_attente" | null;
};

function Ligne({ label, valeur, alerte = false }: { label: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-medium", alerte && "text-amber-600 dark:text-amber-400")}>{valeur}</dd>
    </div>
  );
}

// Un seul geste pour l'équipe : choisir la séjour, copier le lien. Tout ce que voit le client est
// repris de la réservation et de sa pièce d'identité (voir chargerConditionsFiche) ; rien à saisir.
export function LienSejourClient({ sejours, defaultReservationId }: { sejours: SejourLien[]; defaultReservationId?: string }) {
  const [id, setId] = useState(sejours.some((s) => s.id === defaultReservationId) ? (defaultReservationId ?? "") : "");
  const s = sejours.find((x) => x.id === id);
  const plateforme = s ? plateformeDe(s.canal) : null;

  const paiement = !s
    ? ""
    : plateforme
      ? `Tarif et annulation ${plateforme}`
      : Number(s.loyerTotal) > 0
        ? `${s.loyerTotal} ${s.devisePaiement}${Number(s.montantPaye) > 0 ? ` · versé ${s.montantPaye}` : ""}`
        : "Prix convenu à la réservation (à renseigner sur la réservation pour l'afficher)";

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label>Réservation</Label>
          <Select value={id} onValueChange={setId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir la réservation" />
            </SelectTrigger>
            <SelectContent>
              {sejours.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.villaNom} · {x.guestName} · {format(new Date(x.checkIn), "d MMM", { locale: fr })} →{" "}
                  {format(new Date(x.checkOut), "d MMM", { locale: fr })}
                  {x.canal ? ` · ${x.canal}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {s ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3">
              <Ligne label="Logement" valeur={s.villaNom} />
              <Ligne
                label="Séjour"
                valeur={`${format(new Date(s.checkIn), "d MMM", { locale: fr })} → ${format(new Date(s.checkOut), "d MMM yyyy", { locale: fr })}`}
              />
              <Ligne
                label="Personnes"
                valeur={`${s.nbAdultes ?? 1} adulte(s)${s.nbEnfants ? ` · ${s.nbEnfants} enfant(s)` : ""}`}
                alerte={!s.nbAdultes}
              />
              <Ligne
                label="Locataire"
                valeur={s.ficheStatut === "complete" ? "Repris de sa pièce d'identité" : `${s.guestName} (remplacé par sa pièce d'identité)`}
              />
              <Ligne label="Caution" valeur={Number(s.caution) > 0 ? `${s.caution} ${s.devisePaiement}` : "Aucune"} />
              <Ligne label="Paiement" valeur={paiement} />
              <Ligne
                label="Fiche police"
                valeur={s.ficheStatut === "complete" ? "Remplie" : s.ficheStatut === "en_attente" ? "À remplir par le client" : "Sera créée avec le lien"}
              />
              <Ligne label="Conditions" valeur={s.contratStatut === "signe" ? "Signées" : "À signer par le client"} />
            </dl>

            {s.contratStatut === "signe" && s.ficheStatut === "complete" ? (
              <p className="text-sm text-muted-foreground">Ce dossier est complet : rien à envoyer.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <LienClientButton reservationId={s.id} ficheId={s.ficheId} />
                <p className="text-xs text-muted-foreground">
                  {s.ficheStatut === "complete"
                    ? "Fiche déjà remplie : le client ne voit que les conditions à signer."
                    : "Le client remplit sa fiche police (passeport / CIN), puis signe les conditions."}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choisis la réservation : tout est repris automatiquement (logement, dates, personnes, caution, paiement et identité du
            client). Il ne reste qu&apos;à copier le lien et l&apos;envoyer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
