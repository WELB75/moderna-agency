import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getDb } from "@/db";
import { gendarmerieForms, villas, reservations } from "@/db/schema";
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
      nbAdultes: reservations.nbAdultes,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .where(eq(gendarmerieForms.id, id))
    .limit(1);

  if (!form) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <div className="flex w-full items-center justify-between gap-3">
          <Image src="/logo-surete-nationale.png" alt="Sûreté Nationale" width={90} height={56} className="h-10 w-auto sm:h-14" />
          <Logo size={56} />
          <Image src="/logo-gendarmerie-royale.png" alt="Gendarmerie Royale" width={56} height={56} className="h-12 w-auto sm:h-16" />
        </div>
      </div>

      {form.statut === "complete" ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium">
            Merci, ce formulaire a déjà été rempli. / Thank you, this form has already been submitted.
          </p>
        </div>
      ) : (
        <GendarmerieForm
          formId={form.id}
          villaNom={form.villaNom ?? "votre logement"}
          nbAdultes={form.nbAdultes ?? 1}
        />
      )}
    </div>
  );
}
