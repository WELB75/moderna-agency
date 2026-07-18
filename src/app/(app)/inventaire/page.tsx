import Link from "next/link";
import { desc, eq, asc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { inventoryChecklists, villas, procedureTemplates, domaines, products, domaineStock, villaStock } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcedureCard } from "@/components/app/procedure-card";
import { DomaineStockSection } from "@/components/app/domaine-stock-section";
import { VillaStockPanel } from "@/components/app/villa-stock-panel";
import { ClipboardCheck, ListChecks, Plus, Boxes } from "lucide-react";

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

  const procedures = await db.select().from(procedureTemplates).orderBy(asc(procedureTemplates.ordre));

  const allDomaines = await db.select().from(domaines).orderBy(asc(domaines.nom));
  const allProducts = await db.select().from(products).orderBy(asc(products.nom));
  const allDomaineStock = await db.select().from(domaineStock);
  const allVillaStock = await db.select().from(villaStock);
  const allStockVillas = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(villas.type, "villa"))
    .orderBy(asc(domaines.nom), asc(villas.numero));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventaire</h1>
        <p className="text-sm text-muted-foreground">États des lieux et procédures à suivre</p>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">
            <Boxes className="h-4 w-4" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="etats-des-lieux">
            <ClipboardCheck className="h-4 w-4" />
            États des lieux
          </TabsTrigger>
          <TabsTrigger value="procedures">
            <ListChecks className="h-4 w-4" />
            Procédures
          </TabsTrigger>
        </TabsList>

        <TabsContent value="etats-des-lieux" className="space-y-6">
          <div className="flex justify-end">
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
        </TabsContent>

        <TabsContent value="procedures" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Coche les étapes au fur et à mesure ; les cases se réinitialisent à chaque visite. Tu peux
            ajouter, réordonner ou supprimer des étapes librement.
          </p>
          {procedures.map((p) => (
            <ProcedureCard
              key={p.id}
              procedure={{ id: p.id, titre: p.titre, description: p.description, etapes: p.etapes ?? [] }}
            />
          ))}
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <Tabs defaultValue="stock-domaines">
            <TabsList>
              <TabsTrigger value="stock-domaines">Domaines</TabsTrigger>
              <TabsTrigger value="stock-villas">Villas</TabsTrigger>
            </TabsList>

            <TabsContent value="stock-domaines" className="space-y-3 pt-2">
              {allProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun produit enregistré.</p>
              ) : allDomaines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun domaine enregistré.</p>
              ) : (
                allDomaines.map((d) => (
                  <DomaineStockSection
                    key={d.id}
                    domaineId={d.id}
                    domaineNom={d.nom}
                    products={allProducts}
                    stock={allDomaineStock}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="stock-villas" className="pt-2">
              <VillaStockPanel villas={allStockVillas} products={allProducts} stock={allVillaStock} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
