import Link from "next/link";
import Image from "next/image";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddVillaDialog } from "@/components/app/add-villa-dialog";
import { Building2, ChevronRight } from "lucide-react";

export default async function VillasPage() {
  const db = getDb();
  const allVillas = await db.select().from(villas).orderBy(desc(villas.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Villas</h1>
          <p className="text-sm text-muted-foreground">{allVillas.length} villa(s) enregistrée(s)</p>
        </div>
        <AddVillaDialog />
      </div>

      {allVillas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Building2 className="h-8 w-8" />
            <p>Aucune villa pour l&apos;instant. Ajoute ta première villa.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allVillas.map((villa) => (
            <Link key={villa.id} href={`/villas/${villa.id}`}>
              <Card className="overflow-hidden py-0 transition-colors hover:border-primary/50">
                {villa.photoUrl ? (
                  <div className="relative h-32 w-full">
                    <Image
                      src={villa.photoUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <CardHeader className="flex flex-row items-center justify-between gap-2 pt-6">
                  <div>
                    <CardTitle className="text-base">{villa.nom}</CardTitle>
                    <p className="text-sm text-muted-foreground">Villa n°{villa.numero}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pb-6">
                  {villa.superhoteListingId ? (
                    <Badge variant="secondary">Superhote lié</Badge>
                  ) : (
                    <Badge variant="outline">Non lié à Superhote</Badge>
                  )}
                  {villa.adresse ? (
                    <span className="text-xs text-muted-foreground">{villa.adresse}</span>
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
