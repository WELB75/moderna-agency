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
    <div className="space-y-4">
      {arrivee || depart || nbAdultes !== null ? (
        <div className="rounded-lg border p-4 sm:p-5">
          {showVillaHeader ? (
            <h2 className="font-semibold">
              {villaNom} (n°{villaNumero})
            </h2>
          ) : null}
          {arrivee || depart ? (
            <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {arrivee ? `Arrivée : ${arrivee}` : "Arrivée non renseignée"}
                <br />
                {depart ? `Départ : ${depart}` : "Départ non renseigné"}
              </span>
            </div>
          ) : null}
          {nbAdultes !== null ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>
                {nbAdultes} adulte{nbAdultes > 1 ? "s" : ""}
                {nbEnfants ? ` · ${nbEnfants} enfant${nbEnfants > 1 ? "s" : ""}` : ""} attendu
                {nbAdultes + nbEnfants > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}
        </div>
      ) : showVillaHeader ? (
        <h2 className="font-semibold">
          {villaNom} (n°{villaNumero})
        </h2>
      ) : null}

      <div className="space-y-4">
        {occupants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune personne enregistrée pour l&apos;instant.</p>
        ) : (
          occupants.map((o) => (
            <div key={o.id} className="rounded-lg border p-4">
              <p className="font-semibold">
                {[o.prenom, o.nom].filter(Boolean).join(" ") || "Nom non renseigné"}
                {o.nationalite ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{o.nationalite}</span>
                ) : null}
              </p>
              {o.photoPieceUrl ? (
                <Image
                  src={o.photoPieceUrl}
                  alt="Pièce d'identité"
                  width={500}
                  height={320}
                  unoptimized
                  className="mt-2 h-auto w-full rounded-md border object-contain"
                />
              ) : (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Pièce d&apos;identité non fournie</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
