import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, reservations } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { FIELD_KEYS, FIELD_LABELS, DATE_FIELD_KEYS, type GendarmerieLang } from "@/lib/gendarmerie-i18n";
import { formatDateFr } from "@/lib/format-date";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { Download } from "lucide-react";

export default async function GendarmerieDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      statut: gendarmerieForms.statut,
      langue: gendarmerieForms.langue,
      completedAt: gendarmerieForms.completedAt,
      villaId: gendarmerieForms.villaId,
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
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Image
            src="/logo-surete-nationale.png"
            alt="Sûreté Nationale"
            width={90}
            height={56}
            className="h-8 w-auto sm:h-10"
          />
          <p className="text-center text-sm font-semibold uppercase tracking-wide sm:text-base">
            Fiche individuelle de police / gendarmerie
          </p>
          <Image
            src="/logo-gendarmerie-royale.png"
            alt="Gendarmerie Royale"
            width={56}
            height={56}
            className="h-9 w-auto sm:h-12"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {form.villaNom ? `${form.villaNom} (n°${form.villaNumero})` : "Logement non renseigné"}
            {form.checkIn ? ` · ${format(new Date(form.checkIn), "d MMM yyyy", { locale: fr })}` : ""}
          </p>
          <div className="flex items-center gap-2 print:hidden">
            <Logo size={28} />
            {form.statut === "complete" && form.villaId ? (
              <CopyLinkButton
                path={`/securite/villa/${form.villaId}`}
                label="Copier le lien sécurité"
                successMessage="Lien copié — envoie-le une fois à la sécurité, il reste toujours à jour."
              />
            ) : null}
            <PrintButton />
          </div>
        </div>
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
                    <p className="text-sm font-medium">
                      {(DATE_FIELD_KEYS.includes(key) ? formatDateFr(o[key]) : o[key]) || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {o.photoPieceUrl ? (
                  <div className="rounded-md border bg-white p-2">
                    <div className="mb-1 flex items-center justify-between gap-2 print:block">
                      <p className="text-xs text-muted-foreground">Pièce d&apos;identité</p>
                      <a
                        href={o.photoPieceUrl}
                        download={`piece-identite-${[o.prenom, o.nom].filter(Boolean).join("-") || o.id}.jpg`}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden"
                      >
                        <Download className="h-3 w-3" />
                        Télécharger
                      </a>
                    </div>
                    <Image
                      src={o.photoPieceUrl}
                      alt="Pièce d'identité"
                      width={300}
                      height={200}
                      unoptimized
                      className="h-40 w-auto object-contain"
                    />
                  </div>
                ) : null}
                {o.signatureImage ? (
                  <div className="rounded-md border bg-white p-2">
                    <p className="mb-1 text-xs text-muted-foreground">Signature</p>
                    <Image
                      src={o.signatureImage}
                      alt="Signature"
                      width={400}
                      height={150}
                      unoptimized
                      className="h-auto w-full max-w-xs"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
