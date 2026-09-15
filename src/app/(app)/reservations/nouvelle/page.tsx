import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines, personnel } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AddReservationWizard } from "@/components/app/add-reservation-wizard";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { buildVillaPriceDefaults } from "@/lib/whatsapp-agent/villas";
import { buildPersonnelOptions, getQualiteMoyenneById, type PersonnelOption } from "@/lib/personnel-options";

// Page dédiée accessible depuis la nav (Kamel, 2026-09-14 : "faut le placer dans onglet au
// dessus de à faire") — même assistant que le dialogue sur la fiche villa, mais avec un
// sélecteur de logement en première étape puisqu'on n'arrive pas déjà depuis une villa précise.
export default async function NouvelleReservationPage() {
  const db = getDb();

  const allDomainesRaw = await db
    .select({ id: domaines.id, nom: domaines.nom, latitude: domaines.latitude, longitude: domaines.longitude })
    .from(domaines)
    .orderBy(asc(domaines.nom));

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

  const allPersonnel = await db.select().from(personnel);

  // Options enrichies (distance au domaine, notes, note qualité) pour l'étape "Personnel" de
  // l'assistant — Kamel, 2026-09-15 : "tu met les notes ainsi que la distance stp des domaines".
  // Le domaine n'étant choisi qu'à l'étape 1 côté client, on calcule une tranche par domaine ici
  // et le wizard prend la bonne une fois choisi (voir menageOptionsByDomaine côté composant).
  const qualiteById = await getQualiteMoyenneById(db);
  const menageOptionsByDomaine: Record<string, PersonnelOption[]> = {};
  const cuisineOptionsByDomaine: Record<string, PersonnelOption[]> = {};
  for (const d of allDomaines) {
    menageOptionsByDomaine[d.id] = buildPersonnelOptions(allPersonnel, "menage", d, qualiteById);
    cuisineOptionsByDomaine[d.id] = buildPersonnelOptions(allPersonnel, "cuisine", d, qualiteById);
  }

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
            menageOptionsByDomaine={menageOptionsByDomaine}
            cuisineOptionsByDomaine={cuisineOptionsByDomaine}
            villaPriceDefaults={buildVillaPriceDefaults()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
