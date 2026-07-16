import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { PhoneLink } from "@/components/app/phone-link";
import { User } from "lucide-react";

export default async function ProprietairesPage() {
  const db = getDb();

  const allLogements = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
      domaineNom: domaines.nom,
      proprietaireNom: villas.proprietaireNom,
      proprietaireTelephone: villas.proprietaireTelephone,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .orderBy(asc(domaines.nom), asc(villas.numero));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Propriétaires</h1>
        <p className="text-sm text-muted-foreground">Contacts des propriétaires, par logement</p>
      </div>

      {allLogements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <User className="h-8 w-8" />
            <p>Aucun logement pour l&apos;instant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allLogements.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
            >
              <Link href={`/villas/${l.id}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
                {l.domaineNom ? <DomaineBadge nom={l.domaineNom} className="shrink-0" /> : null}
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.type === "appartement" ? "Appartement" : "Villa"} n°{l.numero}
                  </p>
                </div>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-medium">{l.proprietaireNom ?? "Non renseigné"}</p>
                {l.proprietaireTelephone ? <PhoneLink phone={l.proprietaireTelephone} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
