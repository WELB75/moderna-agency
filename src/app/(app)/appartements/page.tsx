import Link from "next/link";
import Image from "next/image";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddVillaDialog } from "@/components/app/add-villa-dialog";
import { AddDomaineDialog } from "@/components/app/add-domaine-dialog";
import { Home, ChevronRight } from "lucide-react";

export default async function AppartementsPage() {
  const db = getDb();
  const allDomaines = await db.select().from(domaines).orderBy(domaines.nom);
  const allAppartements = await db
    .select({
      id: villas.id,
      numero: villas.numero,
      nom: villas.nom,
      adresse: villas.adresse,
      notes: villas.notes,
      photoUrl: villas.photoUrl,
      superhoteListingId: villas.superhoteListingId,
      domaineId: villas.domaineId,
      createdAt: villas.createdAt,
      updatedAt: villas.updatedAt,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(villas.type, "appartement"))
    .orderBy(desc(villas.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appartements</h1>
          <p className="text-sm text-muted-foreground">
            {allAppartements.length} appartement(s) enregistré(s)
          </p>
        </div>
        <div className="flex gap-2">
          <AddDomaineDialog />
          <AddVillaDialog domaines={allDomaines} type="appartement" />
        </div>
      </div>

      {allAppartements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Home className="h-8 w-8" />
            <p>Aucun appartement pour l&apos;instant. Ajoute ton premier appartement.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allAppartements.map((appartement) => (
            <Link key={appartement.id} href={`/villas/${appartement.id}`}>
              <Card className="overflow-hidden py-0 transition-colors hover:border-primary/50">
                {appartement.photoUrl ? (
                  <div className="relative h-32 w-full">
                    <Image
                      src={appartement.photoUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <CardHeader className="flex flex-row items-center justify-between gap-2 pt-6">
                  <div>
                    {appartement.domaineNom ? (
                      <Badge variant="secondary" className="mb-1 text-xs">
                        {appartement.domaineNom}
                      </Badge>
                    ) : null}
                    <CardTitle className="text-base">{appartement.nom}</CardTitle>
                    <p className="text-sm text-muted-foreground">Appartement n°{appartement.numero}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pb-6">
                  {appartement.superhoteListingId ? (
                    <Badge variant="secondary">Superhote lié</Badge>
                  ) : (
                    <Badge variant="outline">Non lié à Superhote</Badge>
                  )}
                  {appartement.adresse ? (
                    <span className="text-xs text-muted-foreground">{appartement.adresse}</span>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
