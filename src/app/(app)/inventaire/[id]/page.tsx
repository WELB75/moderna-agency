import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { inventoryChecklists, inventoryItems, villas } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ChecklistItemRow } from "@/components/app/checklist-item-row";
import { FinalizeChecklist } from "@/components/app/finalize-checklist";
import { deleteChecklist } from "@/lib/actions/inventaire";

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

      {[...groups.entries()].map(([categorie, groupItems]) => (
        <Card key={categorie}>
          <CardHeader>
            <CardTitle className="text-base">{categorie}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupItems.map((item) => (
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
            ))}
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
