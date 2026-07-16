import Image from "next/image";
import { desc, eq, asc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import {
  receipts,
  receiptItems,
  products,
  domaines,
  domaineStock,
  villaStock,
  villas,
} from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddReceiptDialog } from "@/components/app/add-receipt-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { DomaineStockSection } from "@/components/app/domaine-stock-section";
import { VillaStockPanel } from "@/components/app/villa-stock-panel";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteReceipt } from "@/lib/actions/courses";
import { Receipt } from "lucide-react";

export default async function CoursesPage() {
  const db = getDb();

  const allDomaines = await db.select().from(domaines).orderBy(asc(domaines.nom));
  const allProducts = await db.select().from(products).orderBy(asc(products.nom));

  const allVillas = await db
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

  const allReceipts = await db
    .select({
      id: receipts.id,
      photoUrl: receipts.photoUrl,
      montant: receipts.montant,
      notes: receipts.notes,
      createdByName: receipts.createdByName,
      createdAt: receipts.createdAt,
      domaineNom: domaines.nom,
    })
    .from(receipts)
    .leftJoin(domaines, eq(receipts.domaineId, domaines.id))
    .orderBy(desc(receipts.createdAt));

  const allReceiptItems = await db
    .select({
      receiptId: receiptItems.receiptId,
      quantite: receiptItems.quantite,
      productNom: products.nom,
    })
    .from(receiptItems)
    .leftJoin(products, eq(receiptItems.productId, products.id));

  const itemsByReceipt = new Map<string, { productNom: string | null; quantite: number }[]>();
  for (const item of allReceiptItems) {
    const list = itemsByReceipt.get(item.receiptId) ?? [];
    list.push({ productNom: item.productNom, quantite: item.quantite });
    itemsByReceipt.set(item.receiptId, list);
  }

  const allDomaineStock = await db.select().from(domaineStock);
  const allVillaStock = await db.select().from(villaStock);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">Reçus, produits achetés et stock</p>
        </div>
        <AddReceiptDialog domaines={allDomaines} products={allProducts} />
      </div>

      <Tabs defaultValue="recus">
        <TabsList>
          <TabsTrigger value="recus">Reçus</TabsTrigger>
          <TabsTrigger value="stock-domaines">Stock domaines</TabsTrigger>
          <TabsTrigger value="stock-villas">Stock villas</TabsTrigger>
        </TabsList>

        <TabsContent value="recus" className="space-y-3 pt-2">
          {allReceipts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Receipt className="h-8 w-8" />
                <p>Aucun reçu pour l&apos;instant.</p>
              </CardContent>
            </Card>
          ) : (
            allReceipts.map((r) => {
              const items = itemsByReceipt.get(r.id) ?? [];
              return (
                <Card key={r.id} className="overflow-hidden py-0">
                  <div className="flex flex-col sm:flex-row">
                    <a
                      href={r.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="relative h-40 w-full shrink-0 sm:h-auto sm:w-40"
                    >
                      <Image src={r.photoUrl} alt="" fill sizes="160px" className="object-cover" />
                    </a>
                    <div className="flex flex-1 items-start justify-between gap-3 p-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.domaineNom ? <DomaineBadge nom={r.domaineNom} className="text-xs" /> : null}
                          {r.montant ? (
                            <span className="text-sm font-semibold">{Number(r.montant).toFixed(2)} DH</span>
                          ) : null}
                        </div>
                        {items.length > 0 ? (
                          <p className="text-sm">
                            {items.map((it) => `${it.productNom ?? "?"} ×${it.quantite}`).join(", ")}
                          </p>
                        ) : null}
                        {r.notes ? <p className="text-sm text-muted-foreground">{r.notes}</p> : null}
                        <p className="text-xs text-muted-foreground">
                          {r.createdByName ?? "Équipe"} ·{" "}
                          {format(new Date(r.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                        </p>
                      </div>
                      <ConfirmDeleteButton
                        action={deleteReceipt.bind(null, r.id)}
                        title="Supprimer ce reçu ?"
                        description="Le stock du domaine associé sera ajusté en conséquence."
                      />
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>

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
          <VillaStockPanel villas={allVillas} products={allProducts} stock={allVillaStock} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
