import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { gendarmerieForms, villas } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { GendarmerieForm } from "@/components/app/gendarmerie-form";

export default async function PublicGendarmerieFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      statut: gendarmerieForms.statut,
      villaNom: villas.nom,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .where(eq(gendarmerieForms.id, id))
    .limit(1);

  if (!form) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={64} />
      </div>

      {form.statut === "complete" ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium">
            Merci, ce formulaire a déjà été rempli. / Thank you, this form has already been submitted.
          </p>
        </div>
      ) : (
        <GendarmerieForm formId={form.id} villaNom={form.villaNom ?? "votre logement"} />
      )}
    </div>
  );
}
