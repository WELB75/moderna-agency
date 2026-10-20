import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations } from "@/db/schema";
import { getTarification, type TarificationVilla } from "@/lib/pricelabs/sync";
import { CANAL_SEJOUR_PROPRIETAIRE, villaDuCalendrierToken } from "@/lib/calendrier-partage";
import { nowInMorocco } from "@/lib/now";
import { TarificationView } from "@/components/app/tarification-view";
import { ProprietaireReservation, type SejourProprietaire } from "@/components/app/proprietaire-reservation";
import { Logo } from "@/components/app/logo";

export const metadata: Metadata = {
  title: "Calendrier — Superhosts",
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

function montant(n: number, devise: string): string {
  const d = devise.trim().toUpperCase();
  const unite = d === "EUR" || d === "€" ? "€" : d === "MAD" || d === "DH" ? "DH" : d;
  return `${Math.round(n).toLocaleString("fr-FR")} ${unite}`;
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

  // Infos financières et services des seules réservations listées (voir versionPublique : le
  // planning, lui, reste sans montants). Demande de la propriétaire de Villa Lila, 2026-10-19 :
  // prix de la nuitée, acompte ou totalité versée, prix total, cuisinière / ménage.
  const ids = aVenir.map((r) => r.id);
  const db = getDb();
  const finances = new Map(
    (ids.length
      ? await db
          .select({ id: reservations.id, total: reservations.loyerTotal, paye: reservations.montantPaye, devise: reservations.devisePaiement })
          .from(reservations)
          .where(inArray(reservations.id, ids))
      : []
    ).map((f) => [f.id, f])
  );
  const services = new Map<string, { cuisine: boolean; menageSejour: boolean }>();
  if (ids.length) {
    const affectations = await db
      .select({ reservationId: personnelAffectations.reservationId, role: personnel.role, moment: personnelAffectations.moment })
      .from(personnelAffectations)
      .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
      .where(inArray(personnelAffectations.reservationId, ids));
    for (const a of affectations) {
      const cur = services.get(a.reservationId) ?? { cuisine: false, menageSejour: false };
      if (a.role === "cuisine") cur.cuisine = true;
      if (a.role === "menage" && a.moment === "sejour") cur.menageSejour = true;
      services.set(a.reservationId, cur);
    }
  }

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
              const f = finances.get(r.id);
              const total = f?.total ? Number(f.total) : 0;
              const paye = f?.paye ? Number(f.paye) : 0;
              const devise = f?.devise ?? "EUR";
              const srv = services.get(r.id);
              return (
                <li key={r.id} className="space-y-1 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{r.guestName}</span>
                    <span className="text-muted-foreground">
                      {jjmm(r.checkIn)} → {jjmm(r.checkOut)} · {nuits} nuit{nuits > 1 ? "s" : ""}
                      {r.guestsCount ? ` · ${r.guestsCount} voyageur${r.guestsCount > 1 ? "s" : ""}` : ""}
                    </span>
                    {r.canal ? <span className="text-xs text-muted-foreground">{r.canal}</span> : null}
                    {r.enCours ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">En cours</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {total > 0 && nuits > 0 ? (
                      <>
                        <span>Nuitée : {montant(total / nuits, devise)}</span>
                        <span>Total du séjour : {montant(total, devise)}</span>
                        <span>
                          {paye >= total
                            ? "Payé en totalité"
                            : paye > 0
                              ? `Acompte versé : ${montant(paye, devise)} (reste ${montant(total - paye, devise)})`
                              : "Rien versé pour l'instant"}
                        </span>
                      </>
                    ) : null}
                    <span>Cuisinière : {srv?.cuisine ? "oui" : "non"}</span>
                    <span>Ménage pendant le séjour : {srv?.menageSejour ? "oui" : "non"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
