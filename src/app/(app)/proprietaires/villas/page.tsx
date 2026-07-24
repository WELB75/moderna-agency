import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { ProprietaireList } from "@/components/app/proprietaire-list";
import { domaineEstActif } from "@/lib/domaines-actifs";
import { ChevronLeft } from "lucide-react";

export default async function ProprietairesVillasPage() {
  const db = getDb();

  const allVillas = (
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
      .where(eq(villas.type, "villa"))
      .orderBy(asc(domaines.nom), asc(villas.numero))
  ).filter((v) => domaineEstActif(v.domaineNom));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/proprietaires" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Propriétaires
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Villas</h1>
        <p className="text-sm text-muted-foreground">Par domaine</p>
      </div>

      <ProprietaireList logements={allVillas} />
    </div>
  );
}
