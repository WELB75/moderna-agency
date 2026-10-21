import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { ProprietaireList } from "@/components/app/proprietaire-list";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { ChevronLeft } from "lucide-react";

export default async function ProprietairesAppartementsPage() {
  const db = getDb();

  // Logements retirés (Eva, Alba, Prestigia... voir VILLAS_MASQUEES) : hors liste.
  const allAppartements = (
    await db
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
      .where(eq(villas.type, "appartement"))
      .orderBy(asc(domaines.nom), asc(villas.numero))
  ).filter((a) => villaEstGeree(a.nom));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/proprietaires" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Propriétaires
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Appartements</h1>
        <p className="text-sm text-muted-foreground">Par domaine</p>
      </div>

      <ProprietaireList logements={allAppartements} />
    </div>
  );
}
