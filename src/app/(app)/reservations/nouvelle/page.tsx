import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, personnel } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AddReservationWizard } from "@/components/app/add-reservation-wizard";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { buildVillaPriceDefaults } from "@/lib/whatsapp-agent/villas";

// Page dédiée accessible depuis la nav (Kamel, 2026-09-14 : "faut le placer dans onglet au
// dessus de à faire") — même assistant que le dialogue sur la fiche villa, mais avec un
// sélecteur de logement en première étape puisqu'on n'arrive pas déjà depuis une villa précise.
export default async function NouvelleReservationPage() {
  const db = getDb();

  const allDomainesRaw = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines).orderBy(asc(domaines.nom));

  // Contrairement au reste de l'app, ce sélecteur ne doit PAS suivre DOMAINES_MASQUES (Domaine
  // Zaraba/Noria masqués ailleurs pour la phase de test "on ne travaille que sur Moderna II") —
  // Kamel, 2026-09-15, en voyant "Bureau Moderna Agency" (0 villa, un domaine interne) proposé à
  // la place : "y a domaine moderna 1 et 2 et y a noria et prestigia". Ici on veut TOUS les
  // domaines qui ont au moins un vrai logement gérable, rien de plus, rien de moins.
  const allVillas = (
    await db
      .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineId: villas.domaineId })
      .from(villas)
      .orderBy(asc(villas.nom))
  ).filter((v) => villaEstGeree(v.nom));

  const domaineIdsAvecVillas = new Set(allVillas.map((v) => v.domaineId).filter((id): id is string => Boolean(id)));
  const allDomaines = allDomainesRaw.filter((d) => domaineIdsAvecVillas.has(d.id));

  // Même liste plate (sans tri par proximité, la villa n'étant pas encore connue au chargement
  // de la page) que celle utilisée sur la fiche villa — voir personnel-affectation-editor.tsx.
  const allPersonnel = await db.select({ id: personnel.id, nom: personnel.nom, role: personnel.role, actif: personnel.actif }).from(personnel);
  const personnelMenageOptions = allPersonnel.filter((p) => p.role === "menage" && p.actif).map((p) => ({ id: p.id, nom: p.nom }));
  const personnelCuisineOptions = allPersonnel.filter((p) => p.role === "cuisine" && p.actif).map((p) => ({ id: p.id, nom: p.nom }));

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
          <AddReservationWizard
            domaines={allDomaines}
            villas={allVillas}
            menageOptions={personnelMenageOptions}
            cuisineOptions={personnelCuisineOptions}
            villaPriceDefaults={buildVillaPriceDefaults()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
