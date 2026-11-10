import { chargerAvis } from "@/lib/avis/db";
import { moyennesParCategorie, resumer } from "@/lib/avis/stats";
import { LIBELLE_CATEGORIE, type CategorieAvis } from "@/lib/avis/normaliser";
import { CarteAvis, couleurNote10, nombreFr } from "@/components/app/avis-carte";
import { cn } from "@/lib/utils";

// Avis du logement sur le lien propriétaire (/cal/[token]) — Kamel, 2026-11-10 : « laisse les avis,
// ajoute-les sur l'url ». Tous les avis publics sont montrés ; le retour privé d'Airbnb et les
// avis masqués ne le sont jamais. Rien si aucun avis n'a encore été synchronisé.
export async function AvisProprietaire({ villaId }: { villaId: string }) {
  const tous = (await chargerAvis({ villaId })).filter((a) => !a.masque).map((a) => ({ ...a, retourPrive: null }));
  if (tous.length === 0) return null;
  const r = resumer(tous);
  const categories = moyennesParCategorie(tous);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Avis des voyageurs</h2>
        <p className="text-xs text-muted-foreground">Avis Airbnb et Booking.com de votre logement. Note unifiée sur 10 (Airbnb : note sur 5 multipliée par 2).</p>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border text-center">
        <div className="bg-card p-3">
          <p className={cn("text-2xl font-semibold tabular-nums", couleurNote10(r.moyenne10))}>{nombreFr(r.moyenne10)}<span className="text-sm text-muted-foreground">/10</span></p>
          <p className="text-xs text-muted-foreground">{r.n} avis</p>
        </div>
        <div className="bg-card p-3">
          <p className="text-2xl font-semibold tabular-nums">{nombreFr(r.airbnb.moyenne5)}<span className="text-sm text-muted-foreground">/5</span></p>
          <p className="text-xs text-muted-foreground">Airbnb · {r.airbnb.n}</p>
        </div>
        <div className="bg-card p-3">
          <p className="text-2xl font-semibold tabular-nums">{nombreFr(r.booking.moyenne10)}<span className="text-sm text-muted-foreground">/10</span></p>
          <p className="text-xs text-muted-foreground">Booking.com · {r.booking.n}</p>
        </div>
      </div>
      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {[...categories].sort((a, b) => b.moyenne10 - a.moyenne10).map((c) => (
            <span key={c.cle} className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">
              {LIBELLE_CATEGORIE[c.cle as CategorieAvis] ?? c.cle} <span className={cn("font-medium", couleurNote10(c.moyenne10))}>{nombreFr(c.moyenne10)}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        {tous.slice(0, 15).map((a) => (
          <CarteAvis key={a.id} avis={a} afficherLogement={false} />
        ))}
      </div>
    </section>
  );
}
