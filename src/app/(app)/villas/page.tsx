import Link from "next/link";
import Image from "next/image";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddVillaDialog } from "@/components/app/add-villa-dialog";
import { AddDomaineDialog } from "@/components/app/add-domaine-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { filtrerDomainesActifs, logementEstIntegre } from "@/lib/domaines-actifs";
import { Building2, ChevronRight } from "lucide-react";

export default async function VillasPage() {
  const db = getDb();
  const allDomaines = filtrerDomainesActifs(await db.select().from(domaines).orderBy(domaines.nom));
  const allVillas = (
    await db
      .select({
        id: villas.id,
        numero: villas.numero,
        nom: villas.nom,
        adresse: villas.adresse,
        notes: villas.notes,
        photoUrl: villas.photoUrl,
        icalUrl: villas.icalUrl,
        domaineId: villas.domaineId,
        type: villas.type,
        beds24RoomId: villas.beds24RoomId,
        createdAt: villas.createdAt,
        updatedAt: villas.updatedAt,
        domaineNom: domaines.nom,
      })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(desc(villas.createdAt))
  )
    // Fouad, 2026-10-14 : les appartements Cosy (Amal, Jade, Nina, Mama, Maeva, Livia, Lina,
    // Mya...) doivent apparaître dans Hébergements. On y ajoute donc les appartements reliés à
    // Beds24 (ceux réellement loués sur Airbnb/Booking.com), même dans un domaine masqué ailleurs
    // (Noria) ; les villas suivent la règle habituelle des domaines actifs. Les logements retirés
    // (VILLAS_MASQUEES) n'apparaissent plus.
    // Fouad, 2026-10-14 : "prestigia on le met pas" — l'appartement du domaine Prestigia ne
    // figure pas dans Hébergements (il reste accessible depuis /appartements). Règle partagée
    // avec la page Sécurité : voir logementEstIntegre (domaines-actifs.ts).
    .filter((v) => logementEstIntegre(v))
    // Villas d'abord, puis appartements.
    .sort((a, b) => Number(a.type === "appartement") - Number(b.type === "appartement"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hébergements</h1>
          <p className="text-sm text-muted-foreground">{allVillas.length} hébergement(s) enregistré(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddDomaineDialog />
          <AddVillaDialog domaines={allDomaines} />
          <AddVillaDialog domaines={allDomaines} type="appartement" />
        </div>
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
                    {villa.domaineNom ? <DomaineBadge nom={villa.domaineNom} className="mb-1 text-xs" /> : null}
                    <CardTitle className="text-base">{villa.nom}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {villa.type === "appartement" ? "Appartement" : "Villa"} n°{villa.numero}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pb-6">
                  {villa.beds24RoomId ? (
                    <Badge variant="secondary">Beds24 lié</Badge>
                  ) : villa.icalUrl ? (
                    <Badge variant="secondary">Superhote lié</Badge>
                  ) : (
                    <Badge variant="outline">Non lié</Badge>
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
