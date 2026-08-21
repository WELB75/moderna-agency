import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, asc, and, lt, desc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { inventoryChecklists, inventoryItems, villas } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ChecklistItemRow } from "@/components/app/checklist-item-row";
import { SortieItemRow } from "@/components/app/sortie-item-row";
import { CompareWithEntreeButton } from "@/components/app/compare-with-entree-button";
import { FinalizeChecklist } from "@/components/app/finalize-checklist";
import { deleteChecklist } from "@/lib/actions/inventaire";

const CLASSIFICATION_LABELS: Record<string, string> = {
  usure_normale: "Usure normale",
  degat_facturable: "Dégât facturable",
  a_arbitrer_moderna: "À arbitrer avec Moderna",
};

const PRISE_EN_CHARGE_LABELS: Record<string, string> = {
  proprietaire: "Propriétaire",
  moderna: "Moderna",
  locataire: "Locataire",
  a_definir: "À définir",
};

export default async function ChecklistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [checklist] = await db
    .select({
      id: inventoryChecklists.id,
      type: inventoryChecklists.type,
      status: inventoryChecklists.status,
      clientNom: inventoryChecklists.clientNom,
      clientSignatureUrl: inventoryChecklists.clientSignatureUrl,
      agentNom: inventoryChecklists.agentNom,
      agentSignatureUrl: inventoryChecklists.agentSignatureUrl,
      completedAt: inventoryChecklists.completedAt,
      createdAt: inventoryChecklists.createdAt,
      comparedAt: inventoryChecklists.comparedAt,
      reservationId: inventoryChecklists.reservationId,
      villaId: villas.id,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(inventoryChecklists)
    .leftJoin(villas, eq(inventoryChecklists.villaId, villas.id))
    .where(eq(inventoryChecklists.id, id))
    .limit(1);

  if (!checklist) notFound();

  const items = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.checklistId, id))
    .orderBy(asc(inventoryItems.ordre));

  const readOnly = checklist.status === "signe";
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    if (!groups.has(item.categorie)) groups.set(item.categorie, []);
    groups.get(item.categorie)!.push(item);
  }

  const problemsCount = items.filter((i) => i.status === "probleme").length;

  // Pour un checklist de sortie : retrouve l'état des lieux d'entrée correspondant (même villa +
  // même réservation si connue, sinon le dernier entrée avant cette sortie), pour afficher les
  // photos en vis-à-vis — même logique de rapprochement que compareChecklistWithEntree côté serveur.
  let entreePhotosByKey = new Map<string, string[]>();
  let hasEntree = false;
  if (checklist.type === "sortie" && checklist.villaId) {
    let entree = undefined as { id: string } | undefined;
    if (checklist.reservationId) {
      [entree] = await db
        .select({ id: inventoryChecklists.id })
        .from(inventoryChecklists)
        .where(
          and(
            eq(inventoryChecklists.villaId, checklist.villaId),
            eq(inventoryChecklists.type, "entree"),
            eq(inventoryChecklists.reservationId, checklist.reservationId)
          )
        )
        .orderBy(desc(inventoryChecklists.createdAt))
        .limit(1);
    }
    if (!entree) {
      [entree] = await db
        .select({ id: inventoryChecklists.id })
        .from(inventoryChecklists)
        .where(
          and(
            eq(inventoryChecklists.villaId, checklist.villaId),
            eq(inventoryChecklists.type, "entree"),
            lt(inventoryChecklists.createdAt, checklist.createdAt)
          )
        )
        .orderBy(desc(inventoryChecklists.createdAt))
        .limit(1);
    }
    hasEntree = Boolean(entree);
    if (entree) {
      const entreeItems = await db.select().from(inventoryItems).where(eq(inventoryItems.checklistId, entree.id));
      entreePhotosByKey = new Map(entreeItems.map((i) => [`${i.categorie}::${i.libelle}`, i.photoUrls ?? []]));
    }
  }

  const classificationCounts = new Map<string, number>();
  const montantParPriseEnCharge = new Map<string, number>();
  for (const item of items) {
    if (item.usureClassification === "a_definir") continue;
    classificationCounts.set(item.usureClassification, (classificationCounts.get(item.usureClassification) ?? 0) + 1);
    if (item.usureClassification === "degat_facturable" && item.montantEstime) {
      montantParPriseEnCharge.set(
        item.priseEnCharge,
        (montantParPriseEnCharge.get(item.priseEnCharge) ?? 0) + Number(item.montantEstime)
      );
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {checklist.type === "entree" ? "État des lieux d'entrée" : "État des lieux de sortie"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {checklist.villaNom ? `${checklist.villaNom} (n°${checklist.villaNumero})` : "Villa supprimée"} ·{" "}
            {format(new Date(checklist.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={checklist.status === "signe" ? "default" : "outline"}>
            {checklist.status === "signe" ? "Signé" : "Brouillon"}
          </Badge>
          {!readOnly && (
            <ConfirmDeleteButton
              action={deleteChecklist.bind(null, checklist.id)}
              title="Supprimer cet inventaire ?"
              description="Cette action est irréversible."
            />
          )}
        </div>
      </div>

      {problemsCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            {problemsCount} élément(s) signalé(s) comme problématique(s).
          </CardContent>
        </Card>
      )}

      {checklist.type === "sortie" && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <CompareWithEntreeButton checklistId={checklist.id} hasEntree={hasEntree} comparedAt={checklist.comparedAt} />
            {classificationCounts.size > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                {[...classificationCounts.entries()].map(([classification, count]) => (
                  <Badge key={classification} variant="outline">
                    {CLASSIFICATION_LABELS[classification] ?? classification} : {count}
                  </Badge>
                ))}
                {[...montantParPriseEnCharge.entries()].map(([priseEnCharge, montant]) => (
                  <Badge key={priseEnCharge} variant="secondary">
                    {PRISE_EN_CHARGE_LABELS[priseEnCharge] ?? priseEnCharge} : {montant.toLocaleString("fr-FR")} DH
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {[...groups.entries()].map(([categorie, groupItems]) => (
        <Card key={categorie}>
          <CardHeader>
            <CardTitle className="text-base">{categorie}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupItems.map((item) =>
              checklist.type === "sortie" ? (
                <SortieItemRow
                  key={item.id}
                  item={{
                    id: item.id,
                    libelle: item.libelle,
                    status: item.status,
                    commentaire: item.commentaire,
                    photoUrls: item.photoUrls ?? [],
                    compareStatus: item.compareStatus,
                    compareExplication: item.compareExplication,
                    usureClassification: item.usureClassification,
                    priseEnCharge: item.priseEnCharge,
                    montantEstime: item.montantEstime,
                  }}
                  entreePhotoUrls={entreePhotosByKey.get(`${item.categorie}::${item.libelle}`) ?? []}
                  readOnly={readOnly}
                />
              ) : (
                <ChecklistItemRow
                  key={item.id}
                  item={{
                    id: item.id,
                    libelle: item.libelle,
                    status: item.status,
                    commentaire: item.commentaire,
                    photoUrls: item.photoUrls ?? [],
                  }}
                  readOnly={readOnly}
                />
              )
            )}
          </CardContent>
        </Card>
      ))}

      {readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatures</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">
                Client{checklist.clientNom ? ` — ${checklist.clientNom}` : ""}
              </p>
              {checklist.clientSignatureUrl && (
                <div className="relative h-32 w-full overflow-hidden rounded-md border bg-white">
                  <Image src={checklist.clientSignatureUrl} alt="Signature client" fill className="object-contain" />
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">
                Agent{checklist.agentNom ? ` — ${checklist.agentNom}` : ""}
              </p>
              {checklist.agentSignatureUrl && (
                <div className="relative h-32 w-full overflow-hidden rounded-md border bg-white">
                  <Image src={checklist.agentSignatureUrl} alt="Signature agent" fill className="object-contain" />
                </div>
              )}
            </div>
            {checklist.completedAt && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Signé le {format(new Date(checklist.completedAt), "d MMM yyyy HH:mm", { locale: fr })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="sticky bottom-20 md:bottom-4">
          <FinalizeChecklist
            checklistId={checklist.id}
            agentNom={checklist.agentNom}
            defaultClientNom={checklist.clientNom ?? ""}
          />
        </div>
      )}
    </div>
  );
}
