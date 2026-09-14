import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AddReservationWizard } from "@/components/app/add-reservation-wizard";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";

// Page dédiée accessible depuis la nav (Kamel, 2026-09-14 : "faut le placer dans onglet au
// dessus de à faire") — même assistant que le dialogue sur la fiche villa, mais avec un
// sélecteur de logement en première étape puisqu'on n'arrive pas déjà depuis une villa précise.
export default async function NouvelleReservationPage() {
  const db = getDb();

  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(asc(villas.nom))
  ).filter((v) => domaineEstActif(v.domaineNom) && villaEstGeree(v.nom));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle réservation</h1>
        <p className="text-sm text-muted-foreground">Pour les réservations qui ne viennent pas de Superhote.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter une réservation</CardTitle>
          <CardDescription>Choisis le logement, puis les infos principales — étape par étape.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddReservationWizard villas={allVillas} />
        </CardContent>
      </Card>
    </div>
  );
}
