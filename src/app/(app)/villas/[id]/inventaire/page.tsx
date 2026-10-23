import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { getPiecesInventaire } from "@/lib/villa-inventaire";
import { VillaInventairePiece } from "@/components/app/villa-inventaire-piece";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { VillaInventaireAjout } from "@/components/app/villa-inventaire-ajout";

const LIBELLE_TYPE = { chambre: "Chambre", salle_de_bain: "Salle de bain", zone: "Zone" } as const;

// Inventaire de référence de la villa : ce qu'elle contient, pièce par pièce, et dans quel état
// (reprend la « Fiche d'inventaire - Villa » papier). Voir villa-inventaire-modeles.ts.
export default async function VillaInventairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [villa] = await getDb().select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas).where(eq(villas.id, id));
  if (!villa) notFound();

  const pieces = await getPiecesInventaire(id);
  const nbPhotos = pieces.reduce((n, p) => n + p.photos.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-1">
        <Link href={`/villas/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {villa.nom}
        </Link>
        <div className="flex items-center gap-1">
          <h1 className="text-xl font-semibold">Inventaire de {villa.nom}</h1>
          <CopyLinkButton
            path={`/villas/${id}/inventaire`}
            label="Copier le lien de l'inventaire"
            successMessage="Lien copié."
            iconOnly
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {pieces.length} pièce{pieces.length > 1 ? "s" : ""} · {nbPhotos} photo{nbPhotos > 1 ? "s" : ""}
        </p>
      </div>

      <VillaInventaireAjout
        villaId={id}
        nbChambres={pieces.filter((p) => p.type === "chambre").length}
        nbSallesDeBain={pieces.filter((p) => p.type === "salle_de_bain").length}
      />

      {pieces.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucune pièce pour l&apos;instant. Ajoutez une chambre, une salle de bain ou une zone.</p>
      ) : (
        <div className="space-y-2">
          {pieces.map((p) => (
            <details key={p.id} className="group rounded-md border px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                <span>
                  {p.libelle}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {LIBELLE_TYPE[p.type]}
                    {p.photos.length > 0 && ` · ${p.photos.length} photo${p.photos.length > 1 ? "s" : ""}`}
                    {p.observations && " · remarque"}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <VillaInventairePiece
                villaId={id}
                piece={{
                  id: p.id,
                  type: p.type,
                  libelle: p.libelle,
                  details: p.details,
                  observations: p.observations,
                  photos: p.photos,
                }}
              />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
