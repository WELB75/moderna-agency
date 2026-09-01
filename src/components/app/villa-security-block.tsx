import Image from "next/image";
import { CalendarDays, Users, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdPhotoGallery } from "@/components/app/id-photo-gallery";
import { PrintButton } from "@/components/app/print-button";
import { OccupantPhotoCard } from "@/components/app/occupant-photo-card";
import { FIELD_KEYS, FIELD_LABELS, DATE_FIELD_KEYS } from "@/lib/gendarmerie-i18n";
import { formatDateFr } from "@/lib/format-date";

export type SecurityOccupant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  nationalite: string | null;
  photoPieceUrl: string | null;
  estEnfant?: true;
  // Champs du Bulletin Individuel — présents uniquement pour les adultes (table
  // gendarmerieOccupants), jamais pour les entrées enfants ci-dessus. Servent uniquement à
  // imprimer la fiche police officielle de chaque adulte (voir plus bas) ; l'écran normal
  // n'affiche que la photo et le nom, comme avant.
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  profession?: string | null;
  venantDe?: string | null;
  allantA?: string | null;
  dateArrivee?: string | null;
  domicileHabituel?: string | null;
  typePiece?: string | null;
  numeroPiece?: string | null;
  datePiece?: string | null;
  lieuPiece?: string | null;
  signatureNom?: string | null;
  signatureImage?: string | null;
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

// Coupe "mardi 1 septembre 2026 à 17:30" en "mardi 1 septembre 2026" + "à 17:30" pour que, si ça
// doit finir par passer à la ligne sur un très petit écran, la césure tombe avant "à" plutôt
// qu'en plein milieu de l'heure — jamais un "17:" orphelin en fin de ligne.
function DateHeure({ valeur, vide }: { valeur: string | null; vide: string }) {
  if (!valeur) return <span className="font-medium text-foreground">{vide}</span>;
  const [date, heure] = valeur.split(" à ");
  return (
    <span className="font-medium text-foreground">
      {date}
      {heure ? <span className="whitespace-nowrap"> à {heure}</span> : null}
    </span>
  );
}

export function VillaSecurityBlock({
  data,
  showVillaHeader = true,
}: {
  data: VillaSecurityData;
  showVillaHeader?: boolean;
}) {
  const { villaNom, villaNumero, arrivee, depart, nbAdultes, nbEnfants, occupants, arriveeAujourdhui } = data;
  const total = (nbAdultes ?? 0) + nbEnfants;
  const adultes = occupants.filter((o) => !o.estEnfant);

  return (
    <div className="space-y-5">
      <Card className="bg-card print:hidden">
        <CardContent className="space-y-4">
          {showVillaHeader ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Building2 className="h-4.5 w-4.5" />
                </div>
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  {villaNom}
                  <Badge variant="outline" className="border-primary/25 bg-primary/5 font-semibold text-primary">
                    n°{villaNumero}
                  </Badge>
                </h2>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                {arriveeAujourdhui ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    Arrivée aujourd&apos;hui
                  </Badge>
                ) : null}
                {adultes.length > 0 ? <PrintButton /> : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p>
                  <span className="text-muted-foreground">Arrivée : </span>
                  <DateHeure valeur={arrivee} vide="Non renseignée" />
                </p>
                <p>
                  <span className="text-muted-foreground">Départ : </span>
                  <DateHeure valeur={depart} vide="Non renseigné" />
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

      <div className="space-y-2.5 print:hidden">
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

      {/* Fiche police officielle, une par adulte — invisible à l'écran, imprimée avec le bouton
          ci-dessus (window.print()). Reprend le même format que /gendarmerie/[id] (logos Sûreté
          Nationale / Gendarmerie Royale, champs du Bulletin Individuel) pour que ce lien public
          (sans connexion) permette d'imprimer directement, sans passer par l'app. */}
      {adultes.length > 0 ? (
        <div className="hidden print:block print:space-y-8">
          {adultes.map((o, i) => (
            <div key={o.id} className="break-inside-avoid space-y-4" style={i > 0 ? { pageBreakBefore: "always" } : undefined}>
              <div className="flex items-center justify-between gap-3">
                <Image src="/logo-surete-nationale.png" alt="Sûreté Nationale" width={90} height={56} className="h-9 w-auto" />
                <p className="text-center text-sm font-semibold uppercase tracking-wide">Fiche individuelle de police / gendarmerie</p>
                <Image src="/logo-gendarmerie-royale.png" alt="Gendarmerie Royale" width={56} height={56} className="h-10 w-auto" />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {villaNom} (n°{villaNumero})
              </p>
              <div className="rounded-lg border p-5">
                <p className="mb-3 text-sm font-semibold text-muted-foreground">
                  Occupant {i + 1} / {adultes.length}
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {FIELD_KEYS.map((key) => (
                    <div key={key} className="border-b pb-1.5">
                      <p className="text-xs text-muted-foreground">{FIELD_LABELS.fr[key]}</p>
                      <p className="text-sm font-medium">
                        {(DATE_FIELD_KEYS.includes(key) ? formatDateFr(o[key] ?? "") : o[key]) || "—"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {o.photoPieceUrl ? (
                    <OccupantPhotoCard
                      occupantId={o.id}
                      photoPieceUrl={o.photoPieceUrl}
                      downloadName={`piece-identite-${[o.prenom, o.nom].filter(Boolean).join("-") || o.id}.jpg`}
                    />
                  ) : null}
                  {o.signatureImage ? (
                    <div className="rounded-md border bg-white p-2">
                      <p className="mb-1 text-xs text-muted-foreground">Signature</p>
                      <Image src={o.signatureImage} alt="Signature" width={400} height={150} unoptimized className="h-auto w-full max-w-xs" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
