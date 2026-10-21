import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { NewChecklistForm } from "@/components/app/new-checklist-form";
import { villaEstGeree } from "@/lib/domaines-actifs";

export default async function NouvelInventairePage({
  searchParams,
}: {
  searchParams: Promise<{ villaId?: string; type?: string }>;
}) {
  const { villaId, type } = await searchParams;
  const db = getDb();
  // Logements retirés (voir VILLAS_MASQUEES) : plus proposés pour un nouvel état des lieux.
  const allVillas = (await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas)).filter((v) =>
    villaEstGeree(v.nom)
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouvel inventaire</h1>
      <NewChecklistForm villas={allVillas} defaultVillaId={villaId} defaultType={type} />
    </div>
  );
}
