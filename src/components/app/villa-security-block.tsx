import Image from "next/image";
import { CalendarDays, Users } from "lucide-react";

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
  const { villaNom, villaNumero, arrivee, depart, nbAdultes, nbEnfants, occupants } = data;

  return (
    <div className="space-y-3">
      {showVillaHeader ? (
        <h2 className="font-semibold">
          {villaNom} (n°{villaNumero})
        </h2>
      ) : null}

      {arrivee || depart ? (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {arrivee ? `Arrivée : ${arrivee}` : "Arrivée non renseignée"}
            <br />
            {depart ? `Départ : ${depart}` : "Départ non renseigné"}
          </span>
        </div>
      ) : null}
      {nbAdultes !== null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            {nbAdultes} adulte{nbAdultes > 1 ? "s" : ""}
            {nbEnfants ? ` · ${nbEnfants} enfant${nbEnfants > 1 ? "s" : ""}` : ""} attendu
            {nbAdultes + nbEnfants > 1 ? "s" : ""}
          </span>
        </div>
      ) : null}

      {occupants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune personne enregistrée pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {occupants.map((o) => (
            <a
              key={o.id}
              href={o.photoPieceUrl ?? undefined}
              download={o.photoPieceUrl ? `piece-identite-${[o.prenom, o.nom].filter(Boolean).join("-") || o.id}.jpg` : undefined}
              className="flex w-20 flex-col items-center gap-1 text-center"
              title={o.photoPieceUrl ? "Cliquer pour télécharger" : undefined}
            >
              {o.photoPieceUrl ? (
                <Image
                  src={o.photoPieceUrl}
                  alt="Pièce d'identité"
                  width={80}
                  height={56}
                  unoptimized
                  className="h-14 w-20 rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-14 w-20 items-center justify-center rounded-md border border-dashed text-[9px] text-amber-600 dark:text-amber-400">
                  Pas de pièce
                </div>
              )}
              <span className="w-full truncate text-[10px] leading-tight">
                {[o.prenom, o.nom].filter(Boolean).join(" ") || "Sans nom"}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
