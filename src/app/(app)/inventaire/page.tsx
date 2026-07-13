import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { inventoryChecklists, villas } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Plus } from "lucide-react";

export default async function InventairePage() {
  const db = getDb();

  const checklists = await db
    .select({
      id: inventoryChecklists.id,
      type: inventoryChecklists.type,
      status: inventoryChecklists.status,
      clientNom: inventoryChecklists.clientNom,
      createdAt: inventoryChecklists.createdAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(inventoryChecklists)
    .leftJoin(villas, eq(inventoryChecklists.villaId, villas.id))
    .orderBy(desc(inventoryChecklists.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventaire</h1>
          <p className="text-sm text-muted-foreground">États des lieux d&apos;entrée et de sortie</p>
        </div>
        <Button asChild size="sm">
          <Link href="/inventaire/nouveau">
            <Plus className="h-4 w-4" />
            Nouveau
          </Link>
        </Button>
      </div>

      {checklists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p>Aucun état des lieux pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {checklists.map((c) => (
            <Link
              key={c.id}
              href={`/inventaire/${c.id}`}
              className="flex items-center justify-between rounded-md border bg-card p-3 hover:border-primary/50"
            >
              <div>
                <p className="font-medium">
                  {c.villaNom ? `${c.villaNom} (n°${c.villaNumero})` : "Villa supprimée"} ·{" "}
                  {c.type === "entree" ? "Entrée" : "Sortie"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {c.clientNom ?? "Client non renseigné"} ·{" "}
                  {format(new Date(c.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                </p>
              </div>
              <Badge variant={c.status === "signe" ? "default" : "outline"}>
                {c.status === "signe" ? "Signé" : "Brouillon"}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
