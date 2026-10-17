import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { getTarification, type TarificationVilla } from "@/lib/pricelabs/sync";
import { calendrierToken, calendrierTokenValide } from "@/lib/calendrier-partage";
import { TarificationView } from "@/components/app/tarification-view";
import { Logo } from "@/components/app/logo";

export const metadata: Metadata = {
  title: "Calendrier — Moderna Agency",
  robots: { index: false, follow: false },
};

// Ce qui part dans la page publique : le planning (prix, barres de réservation, nom du voyageur,
// canal, nombre de voyageurs), sans téléphone, montants, notes internes, journal ni identifiant
// Beds24 — retirés ICI, côté serveur, pour qu'ils ne transitent même pas dans le HTML envoyé au
// navigateur (le mode lectureSeule du composant ne fait que masquer l'affichage).
function versionPublique(villa: TarificationVilla): TarificationVilla {
  return {
    ...villa,
    beds24RoomId: null,
    error: villa.error ? "Prix temporairement indisponibles" : null,
    reservations: villa.reservations.map((r) => ({
      ...r,
      guestPhone: null,
      montant: null,
      montantPaye: null,
      notes: null,
      ajouteeLe: null,
      ajouteePar: null,
      beds24Echec: false,
    })),
  };
}

// Lien public "calendrier seul" d'un logement — voir lib/calendrier-partage.ts.
export default async function CalendrierPartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length !== 24) notFound();

  const db = getDb();
  const candidats = await db
    .select({ id: villas.id, nom: villas.nom, lienProprietaireToken: villas.lienProprietaireToken })
    .from(villas);
  const villa = candidats.find((v) => calendrierTokenValide(calendrierToken(v.lienProprietaireToken), token));
  if (!villa) notFound();

  const tarifs = (await getTarification({ villaId: villa.id })).map(versionPublique);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">Calendrier</p>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{villa.nom}</h1>
        <p className="text-sm text-muted-foreground">Réservations et prix en direct.</p>
      </div>
      <TarificationView initialVillas={tarifs} lectureSeule />
    </div>
  );
}
