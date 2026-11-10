import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Star } from "lucide-react";
import { LIBELLE_CATEGORIE, type CategorieAvis } from "@/lib/avis/normaliser";
import type { AvisLigne } from "@/lib/avis/db";
import { cn } from "@/lib/utils";

export const nombreFr = (n: number | null, decimales = 1) => (n === null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));

export function couleurNote10(n: number | null): string {
  if (n === null) return "text-muted-foreground";
  if (n >= 9) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 8) return "text-lime-600 dark:text-lime-400";
  if (n >= 7) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

const NOM_SOURCE = { airbnb: "Airbnb", booking: "Booking.com" } as const;

// Un avis : plateforme, note d'origine et sur 10, logement, texte, détail par catégorie, réponse.
// `admin` : montre aussi le retour privé Airbnb et le lien vers la réservation (jamais côté propriétaire).
export function CarteAvis({ avis, afficherLogement = true, admin = false }: { avis: AvisLigne; afficherLogement?: boolean; admin?: boolean }) {
  const quand = avis.publieAt ? format(avis.publieAt, "d MMM yyyy", { locale: fr }) : "date inconnue";
  return (
    <article className={cn("space-y-2.5 rounded-xl border bg-card p-4", avis.masque && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", couleurNote10(avis.note10))}>
              <Star className="h-3.5 w-3.5 fill-current" />
              {nombreFr(avis.note10)}/10
            </span>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {NOM_SOURCE[avis.source]} · {nombreFr(avis.noteOrigine, avis.echelle === 5 ? 0 : 1)}/{avis.echelle}
            </span>
            {avis.masque ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Masqué</span> : null}
            {!avis.reponse ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Sans réponse</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {afficherLogement && avis.villaNom ? <span className="font-medium text-foreground">{avis.villaNom}</span> : null}
            {afficherLogement && avis.villaNom ? " · " : ""}
            {avis.voyageur ? `${avis.voyageur}${avis.pays ? ` (${avis.pays})` : ""} · ` : ""}
            {quand}
          </p>
        </div>
        {admin && avis.reservationId ? (
          <Link href={`/reservations/${avis.reservationId}`} className="text-xs font-medium text-primary hover:underline">
            Voir la réservation
          </Link>
        ) : null}
      </div>

      {avis.titre ? <p className="text-sm font-medium">{avis.titre}</p> : null}
      {avis.source === "booking" && (avis.positif || avis.negatif) ? (
        <div className="space-y-1.5 text-sm">
          {avis.positif ? <p><span className="mr-1 font-medium text-emerald-700 dark:text-emerald-400">+</span>{avis.positif}</p> : null}
          {avis.negatif ? <p><span className="mr-1 font-medium text-red-600 dark:text-red-400">−</span>{avis.negatif}</p> : null}
        </div>
      ) : avis.texte ? (
        <p className="whitespace-pre-wrap text-sm">{avis.texte}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">Note sans commentaire.</p>
      )}

      {avis.detail.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {avis.detail.map((d) => (
            <span key={d.cle} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
              {LIBELLE_CATEGORIE[d.cle as CategorieAvis] ?? d.cle} <span className={cn("font-medium", couleurNote10(d.note10))}>{nombreFr(d.note10)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {admin && avis.retourPrive ? (
        <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
          <span className="font-medium">Retour privé (visible de toi seul) :</span> {avis.retourPrive}
        </p>
      ) : null}

      {avis.reponse ? (
        <div className="rounded-lg bg-muted/60 p-2.5 text-xs">
          <p className="mb-0.5 font-medium">
            Réponse de l&apos;hôte{avis.reponduAt ? ` · ${format(avis.reponduAt, "d MMM yyyy", { locale: fr })}` : ""}
          </p>
          <p className="whitespace-pre-wrap text-muted-foreground">{avis.reponse}</p>
        </div>
      ) : null}
    </article>
  );
}
