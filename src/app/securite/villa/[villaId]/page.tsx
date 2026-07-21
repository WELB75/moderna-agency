import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, reservations, contratsLocation } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { formatDateFr } from "@/lib/format-date";
import { ShieldCheck, CalendarDays, Users } from "lucide-react";

// Lien général et permanent par villa : montre toujours la fiche la plus récente
// remplie pour ce logement, sans avoir à renvoyer un nouveau lien à chaque arrivée.
export default async function SecuriteVillaPage({ params }: { params: Promise<{ villaId: string }> }) {
  const { villaId } = await params;
  const db = getDb();

  const [villa] = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);

  if (!villa) notFound();

  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      completedAt: gendarmerieForms.completedAt,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      contratDateArrivee: contratsLocation.dateArrivee,
      contratDateDepart: contratsLocation.dateDepart,
      contratNbAdultes: contratsLocation.nbAdultes,
      contratNbEnfants: contratsLocation.nbEnfants,
    })
    .from(gendarmerieForms)
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .leftJoin(contratsLocation, eq(gendarmerieForms.contratId, contratsLocation.id))
    .where(and(eq(gendarmerieForms.villaId, villa.id), eq(gendarmerieForms.statut, "complete")))
    .orderBy(desc(gendarmerieForms.completedAt))
    .limit(1);

  const occupants = form
    ? await db
        .select({
          id: gendarmerieOccupants.id,
          nom: gendarmerieOccupants.nom,
          prenom: gendarmerieOccupants.prenom,
          nationalite: gendarmerieOccupants.nationalite,
          photoPieceUrl: gendarmerieOccupants.photoPieceUrl,
        })
        .from(gendarmerieOccupants)
        .where(eq(gendarmerieOccupants.formId, form.id))
        .orderBy(gendarmerieOccupants.createdAt)
    : [];

  const arrivee = form?.checkIn
    ? format(new Date(form.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateArrivee ?? "") || null;
  const depart = form?.checkOut
    ? format(new Date(form.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateDepart ?? "") || null;
  const nbAdultes = form?.nbAdultes ?? form?.contratNbAdultes ?? null;
  const nbEnfants = form?.nbEnfants ?? form?.contratNbEnfants ?? 0;

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Contrôle sécurité — accès domaine
        </div>
      </div>

      <div className="rounded-lg border p-4 text-center sm:p-5">
        <h1 className="text-xl font-bold">
          {villa.nom} (n°{villa.numero})
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Ce lien affiche toujours les derniers occupants enregistrés pour cette villa.
        </p>
      </div>

      {!form ? (
        <p className="text-center text-sm text-muted-foreground">
          Aucune fiche remplie pour l&apos;instant pour cette villa.
        </p>
      ) : (
        <div className="space-y-6">
          {arrivee || depart || nbAdultes !== null ? (
            <div className="rounded-lg border p-4 sm:p-5">
              {arrivee || depart ? (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {arrivee ? `Arrivée : ${arrivee}` : "Arrivée non renseignée"}
                    <br />
                    {depart ? `Départ : ${depart}` : "Départ non renseigné"}
                  </span>
                </div>
              ) : null}
              {nbAdultes !== null ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>
                    {nbAdultes} adulte{nbAdultes > 1 ? "s" : ""}
                    {nbEnfants ? ` · ${nbEnfants} enfant${nbEnfants > 1 ? "s" : ""}` : ""} attendu
                    {nbAdultes + nbEnfants > 1 ? "s" : ""}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
            {occupants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune personne enregistrée pour l&apos;instant.</p>
            ) : (
              occupants.map((o) => (
                <div key={o.id} className="rounded-lg border p-4">
                  <p className="font-semibold">
                    {[o.prenom, o.nom].filter(Boolean).join(" ") || "Nom non renseigné"}
                    {o.nationalite ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">{o.nationalite}</span>
                    ) : null}
                  </p>
                  {o.photoPieceUrl ? (
                    <Image
                      src={o.photoPieceUrl}
                      alt="Pièce d'identité"
                      width={500}
                      height={320}
                      unoptimized
                      className="mt-2 h-auto w-full rounded-md border object-contain"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Pièce d&apos;identité non fournie</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de contrôle Moderna Agency</p>
    </div>
  );
}
