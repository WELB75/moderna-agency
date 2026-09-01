import { CalendarDays, Users, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdPhotoGallery } from "@/components/app/id-photo-gallery";

export type SecurityOccupant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  nationalite: string | null;
  photoPieceUrl: string | null;
};

export type VillaSecurityData = {
  villaId: string;
  villaNom: string;
  villaNumero: string;
  arrivee: string | null;
  depart: string | null;
  nbAdultes: number | null;
  nbEnfants: number;
  occupants: SecurityOccupant[];
  arriveeAujourdhui: boolean;
};

export function VillaSecurityBlock({
  data,
  showVillaHeader = true,
}: {
  data: VillaSecurityData;
  showVillaHeader?: boolean;
}) {
  const { villaNom, villaNumero, arrivee, depart, nbAdultes, nbEnfants, occupants, arriveeAujourdhui } = data;
  const total = (nbAdultes ?? 0) + nbEnfants;

  return (
    <div className="space-y-5">
      <Card className="bg-card">
        <CardContent className="space-y-4">
          {showVillaHeader ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Building2 className="h-4.5 w-4.5" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {villaNom} <span className="font-normal text-muted-foreground">(n°{villaNumero})</span>
                </h2>
              </div>
              {arriveeAujourdhui ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  Arrivée aujourd&apos;hui
                </Badge>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm leading-snug">
                <p>
                  <span className="text-muted-foreground">Arrivée : </span>
                  <span className="font-medium text-foreground">{arrivee ?? "Non renseignée"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Départ : </span>
                  <span className="font-medium text-foreground">{depart ?? "Non renseigné"}</span>
                </p>
              </div>
            </div>
            {nbAdultes !== null ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm leading-snug">
                  <span className="font-medium text-foreground">
                    {nbAdultes} adulte{nbAdultes > 1 ? "s" : ""}
                    {nbEnfants ? ` · ${nbEnfants} enfant${nbEnfants > 1 ? "s" : ""}` : ""}
                  </span>
                  <span className="text-muted-foreground"> attendu{total > 1 ? "s" : ""}</span>
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pièces d&apos;identité{occupants.length > 0 ? ` (${occupants.length})` : ""}
        </p>
        {occupants.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users className="h-8 w-8" />
              <p className="text-sm">Aucune personne enregistrée pour l&apos;instant.</p>
            </CardContent>
          </Card>
        ) : (
          <IdPhotoGallery occupants={occupants} />
        )}
      </div>
    </div>
  );
}
