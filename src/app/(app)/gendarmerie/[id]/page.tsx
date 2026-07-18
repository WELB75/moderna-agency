import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, reservations } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { FIELD_KEYS, FIELD_LABELS, type GendarmerieLang } from "@/lib/gendarmerie-i18n";

export default async function GendarmerieDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      statut: gendarmerieForms.statut,
      langue: gendarmerieForms.langue,
      completedAt: gendarmerieForms.completedAt,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .where(eq(gendarmerieForms.id, id))
    .limit(1);

  if (!form) notFound();

  const occupants = await db
    .select()
    .from(gendarmerieOccupants)
    .where(eq(gendarmerieOccupants.formId, id))
    .orderBy(gendarmerieOccupants.createdAt);

  const clientLang: GendarmerieLang | null =
    form.langue === "fr" || form.langue === "en" || form.langue === "es" || form.langue === "ar"
      ? (form.langue as GendarmerieLang)
      : null;
  const showBilingual = clientLang !== null && clientLang !== "ar";
  const leftLabels = clientLang ? FIELD_LABELS[clientLang] : FIELD_LABELS.fr;
  const arLabels = FIELD_LABELS.ar;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <div>
            <p className="font-semibold">Fiche de police / gendarmerie</p>
            <p className="text-sm text-muted-foreground">
              {form.villaNom ? `${form.villaNom} (n°${form.villaNumero})` : "Logement non renseigné"}
              {form.checkIn ? ` · ${format(new Date(form.checkIn), "d MMM yyyy", { locale: fr })}` : ""}
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {form.statut !== "complete" ? (
        <p className="text-sm text-muted-foreground">Ce formulaire n&apos;a pas encore été rempli par le client.</p>
      ) : (
        <div className="space-y-8">
          {occupants.map((o, i) => (
            <div key={o.id} className="break-inside-avoid rounded-lg border p-5">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">
                Occupant {i + 1} / {occupants.length}
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {FIELD_KEYS.map((key) => (
                  <div key={key} className="border-b pb-1.5">
                    <p className="flex items-baseline justify-between text-xs text-muted-foreground">
                      <span>{leftLabels[key]}</span>
                      {showBilingual ? <span dir="rtl">{arLabels[key]}</span> : null}
                    </p>
                    <p className="text-sm font-medium">{o[key] || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
