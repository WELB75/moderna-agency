import { eq, asc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, reservations, contratsLocation } from "@/db/schema";
import { chargerConditionsFiche } from "@/lib/contrat-donnees";
import { langueConditions } from "@/lib/conditions-sejour";
import { ConditionsSeulesForm } from "@/components/app/conditions-seules-form";
import { Logo } from "@/components/app/logo";
import { GendarmerieFormProgressif } from "@/components/app/gendarmerie-form-progressif";
import { chargerEtatFichePublic } from "@/lib/actions/gendarmerie-progressif";
import { GendarmerieSignatureForm } from "@/components/app/gendarmerie-signature-form";

// Le scan passeport (GendarmerieForm) lit la MRZ via OCR local (voir passport-ocr.ts) : plus lent
// que le timeout par défaut des Server Actions sur cette page, surtout à froid.
export const maxDuration = 60;

export default async function PublicGendarmerieFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      statut: gendarmerieForms.statut,
      langue: gendarmerieForms.langue,
      villaNom: villas.nom,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      nbAdultesPrevu: gendarmerieForms.nbAdultesPrevu,
      nbEnfantsPrevu: gendarmerieForms.nbEnfantsPrevu,
      contratId: gendarmerieForms.contratId,
      contratStatut: contratsLocation.statut,
    })
    .from(gendarmerieForms)
    .leftJoin(villas, eq(gendarmerieForms.villaId, villas.id))
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .leftJoin(contratsLocation, eq(gendarmerieForms.contratId, contratsLocation.id))
    .where(eq(gendarmerieForms.id, id))
    .limit(1);

  if (!form) notFound();

  // Fiche rattachée à un dossier (fiche police + conditions générés depuis Documents) : le lien
  // envoyé par Beds24 mène au dossier complet tant que les conditions ne sont pas signées.
  if (form.contratId && form.contratStatut && form.contratStatut !== "signe" && form.statut !== "complete") {
    redirect(`/dossier/${form.contratId}`);
  }

  // Fiche remplie et dossier dont les conditions (contrat lié) restent à signer : lien de signature.
  if (form.statut === "complete" && form.contratId && form.contratStatut && form.contratStatut !== "signe") {
    redirect(`/c/${form.contratId}`);
  }

  // Conditions de séjour : acceptées en fin de fiche, ou signées seules quand la fiche est déjà
  // remplie (null si déjà signées, blocage, fiche individuelle...).
  const conditions = await chargerConditionsFiche(form.id);

  // Occupants déjà pré-remplis par Kamel depuis les passeports/CIN reçus (cas "attente_signature") :
  // le client n'a plus qu'à relire et signer, pas à ressaisir.
  const occupants =
    form.statut === "attente_signature"
      ? await db
          .select()
          .from(gendarmerieOccupants)
          .where(eq(gendarmerieOccupants.formId, form.id))
          .orderBy(asc(gendarmerieOccupants.createdAt))
      : [];

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <div className="flex w-full items-center justify-between gap-3">
          <Image src="/logo-surete-nationale.png" alt="Sûreté Nationale" width={90} height={56} className="h-10 w-auto sm:h-14" />
          <Logo size={56} />
          <Image src="/logo-gendarmerie-royale.png" alt="Gendarmerie Royale" width={56} height={56} className="h-12 w-auto sm:h-16" />
        </div>
      </div>

      {form.statut === "complete" && conditions ? (
        <ConditionsSeulesForm formId={form.id} lang={langueConditions(form.langue)} conditions={conditions} />
      ) : form.statut === "complete" ? (
        // Fiche complète : écran de confirmation du parcours progressif (permet encore d'ajouter
        // les photos des enfants ou « une personne de plus »).
        <GendarmerieFormProgressif
          formId={form.id}
          villaNom={form.villaNom ?? "votre logement"}
          etatInitial={await chargerEtatFichePublic(form.id)}
          nbEnfants={0}
          conditions={null}
          langueInitiale={form.langue}
        />
      ) : form.statut === "attente_signature" ? (
        <GendarmerieSignatureForm
          formId={form.id}
          villaNom={form.villaNom ?? "votre logement"}
          occupants={occupants}
          conditions={conditions}
        />
      ) : (
        // 2026-10-31 (Fouad) : enregistrement voyageur par voyageur — chacun remplit sa carte
        // depuis son téléphone, ce qui est enregistré reste enregistré, la fiche est complète quand
        // tous les adultes attendus sont là (lib/actions/gendarmerie-progressif.ts).
        <GendarmerieFormProgressif
          formId={form.id}
          villaNom={form.villaNom ?? "votre logement"}
          etatInitial={await chargerEtatFichePublic(form.id)}
          nbEnfants={form.nbEnfants ?? form.nbEnfantsPrevu ?? 0}
          conditions={conditions}
          langueInitiale={form.langue}
        />
      )}
    </div>
  );
}
