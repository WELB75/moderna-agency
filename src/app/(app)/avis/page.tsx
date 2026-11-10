import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { AlertTriangle, MessageSquareReply, Star, TrendingDown, TrendingUp } from "lucide-react";
import { getDb } from "@/db";
import { domaines, villas } from "@/db/schema";
import { logementEstIntegre } from "@/lib/domaines-actifs";
import { logementDansPerimetre, parseTypeStats, type TypeStats } from "@/lib/logement-stats";
import { villasSeulement } from "@/lib/vue-villas";
import { chargerAvis, type AvisLigne } from "@/lib/avis/db";
import { aTraiter, moyennesParCategorie, parLogement, parMois, repartition, resumer, SEUIL_AVIS_BAS } from "@/lib/avis/stats";
import { LIBELLE_CATEGORIE, type CategorieAvis } from "@/lib/avis/normaliser";
import { AvisActualiser } from "@/components/app/avis-actualiser";
import { CarteAvis, couleurNote10, nombreFr } from "@/components/app/avis-carte";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { type?: string; source?: string; villa?: string; note?: string; reponse?: string; limite?: string };

const lien = (p: Params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/avis?${s}` : "/avis";
};

// Onglet Avis (Kamel, 2026-11-10) : avis Airbnb et Booking.com récupérés via Beds24, avec stats par
// logement, villas contre appartements, catégories, évolution et fil filtrable. Note unifiée = note
// sur 10 (Airbnb × 2) pour comparer les plateformes ; les notes d'origine restent affichées.
export default async function AvisPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const villasUniquement = await villasSeulement();
  const perimetre: TypeStats = villasUniquement ? "villa" : parseTypeStats(params.type);
  const now = new Date();

  const logements = (
    await getDb()
      .select({ id: villas.id, nom: villas.nom, type: villas.type, beds24RoomId: villas.beds24RoomId, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(asc(villas.type), asc(villas.nom))
  ).filter((v) => logementEstIntegre(v) && logementDansPerimetre(v.type, perimetre));
  const idsPerimetre = new Set(logements.map((l) => l.id));

  const tous = (await chargerAvis()).filter((a) => a.villaId && idsPerimetre.has(a.villaId));
  const vide = tous.length === 0;

  const resume = resumer(tous);
  const lignes = parLogement(tous, logements.map((l) => ({ id: l.id, nom: l.nom, type: l.type, domaine: l.domaineNom })), now).sort(
    (a, b) => (b.moyenne10 ?? -1) - (a.moyenne10 ?? -1) || b.n - a.n
  );
  const { bas, sansReponse } = aTraiter(tous, now);
  const categories = moyennesParCategorie(tous);
  const etoiles = repartition(tous);
  const mois = parMois(tous, now);
  const maxMois = Math.max(1, ...mois.map((m) => m.n));
  const villasR = resumer(tous.filter((a) => a.villaType === "villa"));
  const appartsR = resumer(tous.filter((a) => a.villaType === "appartement"));

  // Fil filtré.
  const note = params.note === "bas" ? "bas" : params.note === "haut" ? "haut" : "";
  const filtres = tous.filter(
    (a) =>
      (!params.source || a.source === params.source) &&
      (!params.villa || a.villaId === params.villa) &&
      (note === "" || (note === "bas" ? a.note10 <= SEUIL_AVIS_BAS : a.note10 >= 9)) &&
      (params.reponse !== "sans" || !a.reponse)
  );
  const limite = Math.min(500, Math.max(20, Number(params.limite) || 20));
  const villaChoisie = logements.find((l) => l.id === params.villa);

  const onglets: { v: TypeStats; label: string }[] = villasUniquement
    ? []
    : [{ v: "villa", label: "Villas" }, { v: "appartement", label: "Appartements" }, { v: "total", label: "Total" }];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Avis</h1>
          <p className="text-sm text-muted-foreground">Avis Airbnb et Booking.com, récupérés chaque matin via Beds24 — note unifiée sur 10 (Airbnb × 2).</p>
        </div>
        <AvisActualiser />
      </div>

      {onglets.length > 0 ? (
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
          {onglets.map((o) => (
            <Link key={o.v} href={lien({ type: o.v === "total" ? undefined : o.v })} className={cn("rounded-md px-4 py-1.5", perimetre === o.v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
              {o.label}
            </Link>
          ))}
        </div>
      ) : null}

      {vide ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun avis pour l&apos;instant. Clique sur « Actualiser » pour lancer la première récupération depuis Beds24 (la synchro automatique passe chaque matin).
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
            <Tuile titre="Note unifiée" valeur={nombreFr(resume.moyenne10)} unite="/10" sous={`${resume.n} avis`} classe={couleurNote10(resume.moyenne10)} />
            <Tuile titre="Airbnb" valeur={nombreFr(resume.airbnb.moyenne5)} unite="/5" sous={`${resume.airbnb.n} avis`} />
            <Tuile titre="Booking.com" valeur={nombreFr(resume.booking.moyenne10)} unite="/10" sous={`${resume.booking.n} avis`} />
            <Tuile titre="Taux de réponse" valeur={resume.tauxReponse === null ? "—" : String(resume.tauxReponse)} unite="%" sous={`${resume.sansReponse} sans réponse`} />
          </section>

          {bas.length + sansReponse.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">À traiter</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {bas.length > 0 ? (
                  <Link href={lien({ type: params.type, note: "bas" })} className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 hover:border-red-500/60">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <div className="text-sm">
                      <p className="font-medium">{bas.length} avis à {SEUIL_AVIS_BAS}/10 ou moins ces 30 derniers jours</p>
                      <p className="text-xs text-muted-foreground">Voir les avis négatifs et créer un ticket maintenance si besoin.</p>
                    </div>
                  </Link>
                ) : null}
                {sansReponse.length > 0 ? (
                  <Link href={lien({ type: params.type, reponse: "sans" })} className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 hover:border-amber-500/60">
                    <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-sm">
                      <p className="font-medium">{sansReponse.length} avis sans réponse depuis plus de 48 h</p>
                      <p className="text-xs text-muted-foreground">Répondre depuis Airbnb ou Booking.com (l&apos;API ne permet pas de répondre d&apos;ici).</p>
                    </div>
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Par logement</h2>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Logement</th>
                    <th className="px-3 py-2 text-right font-medium">Note /10</th>
                    <th className="px-3 py-2 text-right font-medium">Airbnb /5</th>
                    <th className="px-3 py-2 text-right font-medium">Booking /10</th>
                    <th className="px-3 py-2 text-right font-medium">Avis</th>
                    <th className="px-3 py-2 text-right font-medium">Tendance</th>
                    <th className="px-3 py-2 text-right font-medium">Sans réponse</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lignes.map((l) => (
                    <tr key={l.villaId} className="hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <Link href={lien({ type: params.type, villa: l.villaId })} className="font-medium hover:underline">{l.nom}</Link>
                        <span className="ml-1.5 text-xs text-muted-foreground">{l.type === "appartement" ? "appart." : "villa"}{l.domaine ? ` · ${l.domaine}` : ""}</span>
                      </td>
                      <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", couleurNote10(l.moyenne10))}>{nombreFr(l.moyenne10)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nombreFr(l.airbnb.moyenne5)}<span className="ml-1 text-xs text-muted-foreground">({l.airbnb.n})</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{nombreFr(l.booking.moyenne10)}<span className="ml-1 text-xs text-muted-foreground">({l.booking.n})</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.n}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.tendance === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={cn("inline-flex items-center gap-0.5", l.tendance > 0 ? "text-emerald-600" : l.tendance < 0 ? "text-red-600" : "text-muted-foreground")}>
                            {l.tendance > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : l.tendance < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                            {l.tendance > 0 ? "+" : ""}{nombreFr(l.tendance)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.sansReponse > 0 ? <span className="font-medium text-amber-600">{l.sansReponse}</span> : <span className="text-muted-foreground">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Tendance : moyenne des 90 derniers jours moins celle des 90 jours précédents (en points sur 10).</p>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {perimetre === "total" ? (
              <div className="space-y-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Villas contre appartements</h2>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                  {[["Villas", villasR], ["Appartements", appartsR]].map(([nom, r]) => (
                    <div key={String(nom)} className="bg-card p-4">
                      <p className="text-sm text-muted-foreground">{String(nom)}</p>
                      <p className={cn("text-2xl font-semibold tabular-nums", couleurNote10((r as typeof villasR).moyenne10))}>{nombreFr((r as typeof villasR).moyenne10)}<span className="text-sm text-muted-foreground">/10</span></p>
                      <p className="text-xs text-muted-foreground">{(r as typeof villasR).n} avis · {(r as typeof villasR).sansReponse} sans réponse</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Répartition des notes</h2>
              <div className="space-y-1.5 rounded-xl border bg-card p-4">
                {etoiles.map((e) => (
                  <div key={e.etoiles} className="flex items-center gap-2 text-xs">
                    <span className="flex w-8 items-center gap-0.5 tabular-nums">{e.etoiles}<Star className="h-3 w-3 fill-current text-amber-500" /></span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${resume.n ? (e.n / resume.n) * 100 : 0}%` }} /></div>
                    <span className="w-8 text-right tabular-nums text-muted-foreground">{e.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Par catégorie (points faibles d&apos;abord)</h2>
              <div className="space-y-1.5 rounded-xl border bg-card p-4">
                {categories.length === 0 ? <p className="text-sm text-muted-foreground">Pas de notes détaillées.</p> : categories.map((c) => (
                  <div key={c.cle} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 truncate">{LIBELLE_CATEGORIE[c.cle as CategorieAvis] ?? c.cle}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${c.moyenne10 * 10}%` }} /></div>
                    <span className={cn("w-8 text-right font-medium tabular-nums", couleurNote10(c.moyenne10))}>{nombreFr(c.moyenne10)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Évolution sur 12 mois</h2>
              <div className="flex h-40 items-end gap-1.5 rounded-xl border bg-card p-4">
                {mois.map((m) => (
                  <div key={m.mois} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.mois} : ${m.n} avis, moyenne ${nombreFr(m.moyenne10)}/10`}>
                    <span className={cn("text-[10px] tabular-nums", couleurNote10(m.moyenne10))}>{m.moyenne10 === null ? "" : nombreFr(m.moyenne10)}</span>
                    <div className="w-full rounded-t bg-primary/70" style={{ height: `${(m.n / maxMois) * 70}%`, minHeight: m.n ? 3 : 0 }} />
                    <span className="text-[10px] text-muted-foreground">{m.mois.slice(5)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Hauteur = nombre d&apos;avis du mois ; au-dessus = note moyenne /10.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Fil des avis{villaChoisie ? ` · ${villaChoisie.nom}` : ""} ({filtres.length})
            </h2>
            <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
              {params.type ? <input type="hidden" name="type" value={params.type} /> : null}
              <select name="source" defaultValue={params.source ?? ""} className="h-9 rounded-md border bg-background px-2">
                <option value="">Toutes les plateformes</option>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking.com</option>
              </select>
              <select name="villa" defaultValue={params.villa ?? ""} className="h-9 rounded-md border bg-background px-2">
                <option value="">Tous les logements</option>
                {logements.map((l) => (<option key={l.id} value={l.id}>{l.nom}</option>))}
              </select>
              <select name="note" defaultValue={note} className="h-9 rounded-md border bg-background px-2">
                <option value="">Toutes les notes</option>
                <option value="bas">{SEUIL_AVIS_BAS}/10 et moins</option>
                <option value="haut">9/10 et plus</option>
              </select>
              <select name="reponse" defaultValue={params.reponse ?? ""} className="h-9 rounded-md border bg-background px-2">
                <option value="">Avec ou sans réponse</option>
                <option value="sans">Sans réponse</option>
              </select>
              <button type="submit" className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground">Filtrer</button>
              <Link href={lien({ type: params.type })} className="text-xs text-muted-foreground hover:underline">Réinitialiser</Link>
            </form>
            {filtres.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun avis ne correspond à ces filtres.</p>
            ) : (
              <div className="space-y-2">
                {filtres.slice(0, limite).map((a: AvisLigne) => (<CarteAvis key={a.id} avis={a} admin />))}
              </div>
            )}
            {filtres.length > limite ? (
              <Link href={lien({ ...params, limite: String(limite + 40) })} className="block rounded-lg border py-2 text-center text-sm font-medium hover:bg-muted">Voir plus d&apos;avis</Link>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function Tuile({ titre, valeur, unite, sous, classe }: { titre: string; valeur: string; unite: string; sous: string; classe?: string }) {
  return (
    <div className="space-y-1 bg-card p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">{titre}</p>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl", classe)}>
        {valeur}<span className="ml-1 text-base font-medium text-muted-foreground">{unite}</span>
      </p>
      <p className="text-xs text-muted-foreground">{sous}</p>
    </div>
  );
}
