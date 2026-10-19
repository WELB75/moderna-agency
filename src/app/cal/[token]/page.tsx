import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { getTarification, type TarificationVilla } from "@/lib/pricelabs/sync";
import { CANAL_SEJOUR_PROPRIETAIRE, villaDuCalendrierToken } from "@/lib/calendrier-partage";
import { nowInMorocco } from "@/lib/now";
import { TarificationView } from "@/components/app/tarification-view";
import { ProprietaireReservation, type SejourProprietaire } from "@/components/app/proprietaire-reservation";
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

function jjmm(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;
}

// Lien public "calendrier seul" d'un logement — voir lib/calendrier-partage.ts. Le propriétaire
// peut aussi y réserver (et annuler) ses propres séjours, voir actions/calendrier-proprietaire.ts.
export default async function CalendrierPartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const villa = await villaDuCalendrierToken(token);
  if (!villa) notFound();

  const tarifs = (await getTarification({ villaId: villa.id })).map(versionPublique);

  // Séjours propriétaire pas encore commencés : les seuls annulables depuis ce lien (même règle
  // que annulerSejourProprietaire).
  const demain = nowInMorocco();
  demain.setUTCHours(0, 0, 0, 0);
  demain.setUTCDate(demain.getUTCDate() + 1);
  const sejours: SejourProprietaire[] = (
    await getDb()
      .select({ id: reservations.id, nom: reservations.guestName, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
      .from(reservations)
      .where(
        and(
          eq(reservations.villaId, villa.id),
          eq(reservations.source, "manuel"),
          eq(reservations.canal, CANAL_SEJOUR_PROPRIETAIRE),
          gt(reservations.checkIn, demain)
        )
      )
      .orderBy(asc(reservations.checkIn))
  ).map((s) => ({
    id: s.id,
    nom: s.nom,
    arrivee: new Date(s.checkIn).toISOString().slice(0, 10),
    depart: new Date(s.checkOut).toISOString().slice(0, 10),
  }));

  const aujourdhui = nowInMorocco().toISOString().slice(0, 10);

  // Clé de la grille : la recrée quand les réservations changent (après une réservation ou une
  // annulation, router.refresh() renvoie de nouvelles données mais le composant garde son état).
  const cleGrille = createHash("sha1")
    .update(tarifs.flatMap((v) => v.reservations.map((r) => `${r.id}:${r.checkIn}:${r.checkOut}`)).join("|"))
    .digest("hex");

  // Réservations à venir (ou en cours), une ligne chacune : nom, dates, nuits, voyageurs, canal.
  // Rien d'autre (ni montants ni téléphone) — déjà retirés par versionPublique.
  const aVenir = tarifs
    .flatMap((v) => v.reservations)
    .filter((r) => r.enCours || r.checkIn >= aujourdhui)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

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
      <ProprietaireReservation token={token} nomParDefaut={villa.proprietaireNom || "Propriétaire"} sejours={sejours} />
      <TarificationView key={cleGrille} initialVillas={tarifs} lectureSeule />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Réservations à venir</h2>
        {aVenir.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune réservation à venir.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {aVenir.map((r) => {
              const nuits = Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86400000);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="font-medium">{r.guestName}</span>
                  <span className="text-muted-foreground">
                    {jjmm(r.checkIn)} → {jjmm(r.checkOut)} · {nuits} nuit{nuits > 1 ? "s" : ""}
                    {r.guestsCount ? ` · ${r.guestsCount} voyageur${r.guestsCount > 1 ? "s" : ""}` : ""}
                  </span>
                  {r.canal ? <span className="text-xs text-muted-foreground">{r.canal}</span> : null}
                  {r.enCours ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">En cours</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
