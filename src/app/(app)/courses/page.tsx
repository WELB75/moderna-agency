import Image from "next/image";
import { desc, eq, asc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { receipts, receiptItems, products, domaines } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { AddReceiptDialog } from "@/components/app/add-receipt-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteReceipt } from "@/lib/actions/courses";
import { filtrerDomainesActifs, domaineEstActif } from "@/lib/domaines-actifs";
import { Receipt } from "lucide-react";

export default async function CoursesPage() {
  const db = getDb();

  const allDomaines = filtrerDomainesActifs(await db.select().from(domaines).orderBy(asc(domaines.nom)));
  const allProducts = await db.select().from(products).orderBy(asc(products.nom));

  const allReceipts = (
    await db
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
      .orderBy(desc(receipts.createdAt))
  ).filter((r) => domaineEstActif(r.domaineNom));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">Reçus et produits achetés</p>
        </div>
        <AddReceiptDialog domaines={allDomaines} products={allProducts} />
      </div>

      <div className="space-y-3">
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
      </div>
    </div>
  );
}
