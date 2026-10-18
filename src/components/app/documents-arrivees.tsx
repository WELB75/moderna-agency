import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays, endOfDay, format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileSignature, FileText, ShieldCheck, type LucideIcon } from "lucide-react";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, reservations, villas } from "@/db/schema";
import { CanalDot } from "@/components/app/canal-badge";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { statutCaution, statutFichePolice } from "@/components/app/suivi-arrivees";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { sejourSansVoyageur } from "@/lib/conditions-sejour";
import { cn } from "@/lib/utils";

// Suivi des dossiers voyageurs (onglet par défaut de Documents) — Fouad, 2026-10-18 : les
// statistiques "fiches générées / remplies" comptaient des fiches jamais envoyées (blocages,
// séjours dans 2 mois...) et affichaient 5 % de complétion. On suit ici chaque séjour en cours ou
// à venir sur 14 jours : fiche police, conditions de séjour (signées en fin de fiche) et caution.
// Seules les vraies réservations comptent (pas les blocages, travaux, séjours Famille).

const NB_JOURS = 14;

type Tone = "ok" | "attente" | "urgent" | "neutre";
type Statut = { tone: Tone; label: string; detail?: string };

const TONE_CLASSES: Record<Tone, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400",
  attente: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:border-amber-500/20 dark:text-amber-400",
  urgent: "border-red-500/30 bg-red-500/5 text-red-700 dark:border-red-500/20 dark:text-red-400",
  neutre: "border-border bg-muted/40 text-muted-foreground",
};

function Chip({ icon: Icon, titre, statut, href }: { icon: LucideIcon; titre: string; statut: Statut; href?: string }) {
  const contenu = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-muted-foreground">{titre} ·</span>
        <span className="font-medium">{statut.label}</span>
      </span>
      {statut.detail ? <span className="block text-[11px] text-muted-foreground">{statut.detail}</span> : null}
    </>
  );
  const classes = cn("block min-w-0 rounded-md border px-2 py-1 text-xs", TONE_CLASSES[statut.tone]);
  return href ? (
    <Link href={href} className={cn(classes, "transition-opacity hover:opacity-80")}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}

function statutConditions(
  contrat: { id: string; statut: string } | null,
  ficheComplete: boolean,
  checkIn: Date,
  now: Date
): Statut {
  if (contrat?.statut === "signe") return { tone: "ok", label: "Signées" };
  if (contrat) return { tone: "attente", label: "Lien envoyé, pas signées" };
  if (ficheComplete) return { tone: "neutre", label: "Non signées", detail: "Fiche remplie avant les conditions en ligne" };
  if (now >= checkIn) return { tone: "urgent", label: "Non signées" };
  return { tone: "neutre", label: "Avec la fiche police" };
}

export async function DocumentsArrivees({ now }: { now: Date }) {
  const db = getDb();
  const fin = endOfDay(addDays(now, NB_JOURS - 1));

  const sejours = (
    await db
      .select({
        id: reservations.id,
        villaId: reservations.villaId,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        canal: reservations.canal,
        caution: reservations.caution,
        cautionPayee: reservations.cautionPayee,
        villaNom: villas.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, now), lte(reservations.checkIn, fin)))
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => villaEstGeree(r.villaNom) && !sejourSansVoyageur(r));

  const ids = sejours.map((r) => r.id);
  const fiches =
    ids.length > 0
      ? await db
          .select({ id: gendarmerieForms.id, reservationId: gendarmerieForms.reservationId, statut: gendarmerieForms.statut })
          .from(gendarmerieForms)
          .where(inArray(gendarmerieForms.reservationId, ids))
      : [];
  const ficheParResa = new Map<string, { id: string; complete: boolean }>();
  for (const f of fiches) {
    if (!f.reservationId) continue;
    const actuelle = ficheParResa.get(f.reservationId);
    if (!actuelle || (f.statut === "complete" && !actuelle.complete)) {
      ficheParResa.set(f.reservationId, { id: f.id, complete: f.statut === "complete" });
    }
  }

  const villaIds = Array.from(new Set(sejours.map((r) => r.villaId).filter((id): id is string => Boolean(id))));
  const contrats =
    villaIds.length > 0
      ? await db
          .select({
            id: contratsLocation.id,
            villaId: contratsLocation.villaId,
            dateArrivee: contratsLocation.dateArrivee,
            statut: contratsLocation.statut,
          })
          .from(contratsLocation)
          .where(inArray(contratsLocation.villaId, villaIds))
      : [];
  const contratParSejour = new Map<string, { id: string; statut: string }>();
  for (const c of contrats) {
    if (!c.villaId || !c.dateArrivee) continue;
    const cle = `${c.villaId}|${c.dateArrivee}`;
    const actuel = contratParSejour.get(cle);
    if (!actuel || (c.statut === "signe" && actuel.statut !== "signe")) contratParSejour.set(cle, { id: c.id, statut: c.statut });
  }

  const lignes = sejours.map((r) => {
    const fiche = ficheParResa.get(r.id) ?? null;
    const contrat = r.villaId ? (contratParSejour.get(`${r.villaId}|${format(r.checkIn, "yyyy-MM-dd")}`) ?? null) : null;
    const police = statutFichePolice(r, fiche ? (fiche.complete ? "complete" : "en_attente") : null, now);
    const conditions = statutConditions(contrat, Boolean(fiche?.complete), r.checkIn, now);
    return {
      ...r,
      fiche,
      contrat,
      police,
      conditions,
      caution: statutCaution(r, now),
      enCours: r.checkIn <= now,
      complet: police.tone === "ok" && conditions.tone === "ok",
    };
  });

  const aVenir = lignes.filter((l) => !l.enCours);
  const complets = aVenir.filter((l) => l.complet).length;
  const aRelancer = lignes.filter((l) => l.police.tone === "attente" || l.police.tone === "urgent").length;
  const sansFiche = lignes.filter((l) => l.police.tone === "urgent").length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Compteur label={`Arrivées sur ${NB_JOURS} jours`} valeur={aVenir.length} />
        <Compteur label="Dossiers complets" valeur={`${complets} / ${aVenir.length}`} />
        <Compteur label="Fiches à relancer" valeur={aRelancer} tone={aRelancer > 0 ? "attente" : undefined} />
        <Compteur label="Sur place sans fiche" valeur={sansFiche} tone={sansFiche > 0 ? "urgent" : undefined} />
      </div>
      <p className="text-xs text-muted-foreground">
        Le lien de la fiche police part automatiquement par Beds24 à J-2 (10h) ; le voyageur y signe aussi les conditions de
        séjour. Copie le lien pour le renvoyer à la main (WhatsApp) si besoin.
      </p>

      {lignes.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">Aucun séjour en cours ni d&apos;arrivée sur {NB_JOURS} jours.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {lignes.map((l) => (
            <li
              key={l.id}
              className="grid gap-2 p-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-3"
            >
              <Link href={`/reservations/${l.id}`} className="flex min-w-0 items-center gap-2.5 hover:opacity-80">
                <CanalDot canal={l.canal} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {l.villaNom ?? "Logement"} · {l.guestName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {l.enCours ? "En cours · " : ""}
                    {format(l.checkIn, "EEE d MMM", { locale: fr })} → {format(l.checkOut, "EEE d MMM", { locale: fr })}
                  </span>
                </span>
              </Link>
              <Chip
                icon={FileText}
                titre="Fiche police"
                statut={l.police}
                href={l.fiche ? (l.fiche.complete ? `/gendarmerie/${l.fiche.id}` : `/g/${l.fiche.id}`) : undefined}
              />
              <Chip
                icon={FileSignature}
                titre="Conditions"
                statut={l.conditions}
                href={l.contrat ? `/contrats/${l.contrat.id}` : undefined}
              />
              <Chip icon={ShieldCheck} titre="Caution" statut={l.caution} href={`/reservations/${l.id}`} />
              <div className="flex justify-end">
                {l.fiche && !l.fiche.complete ? (
                  <CopyLinkButton
                    path={`/g/${l.fiche.id}`}
                    label="Copier le lien de la fiche police"
                    successMessage="Lien de la fiche police copié."
                    iconOnly
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Compteur({ label, valeur, tone }: { label: string; valeur: string | number; tone?: "attente" | "urgent" }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "attente" && "text-amber-600 dark:text-amber-400",
          tone === "urgent" && "text-red-600 dark:text-red-400"
        )}
      >
        {valeur}
      </p>
    </div>
  );
}
