import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { Mic, Send } from "lucide-react";
import { getDb } from "@/db";
import { domaines, villas } from "@/db/schema";
import { villaNotes } from "@/db/schema-notes";
import { logementEstIntegre } from "@/lib/domaines-actifs";
import { villasSeulement } from "@/lib/vue-villas";
import { CATEGORIES_NOTES, categorieNoteValide, libelleCategorieNote } from "@/lib/notes-villa";
import { NotesFormulaire } from "@/components/app/notes-formulaire";
import { NoteActions } from "@/components/app/note-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { villa?: string; cat?: string; etat?: string };

const lien = (p: Params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/notes?${s}` : "/notes";
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" });

// Notes de suivi par logement (Kamel, 2026-11-24) : état du logement, travaux, aléas, cautions et
// argent, demandes spécifiques, suivi général. Alimentée par la page elle-même et par l'agent
// Telegram (vocaux de Mohamed transcrits puis classés).
export default async function NotesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const db = getDb();
  const villasUniquement = await villasSeulement();

  const logements = (
    await db
      .select({ id: villas.id, nom: villas.nom, type: villas.type, beds24RoomId: villas.beds24RoomId, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(asc(villas.type), asc(villas.nom))
  ).filter((v) => logementEstIntegre(v) && (!villasUniquement || v.type === "villa"));

  const villaChoisie = logements.some((l) => l.id === params.villa) ? params.villa! : "";
  const categorieChoisie = params.cat ? categorieNoteValide(params.cat) : "";
  const seulementOuvertes = params.etat === "ouvertes";

  const toutes = await db
    .select({
      id: villaNotes.id,
      villaId: villaNotes.villaId,
      villaNom: villas.nom,
      categorie: villaNotes.categorie,
      texte: villaNotes.texte,
      montant: villaNotes.montant,
      devise: villaNotes.devise,
      auteurNom: villaNotes.auteurNom,
      source: villaNotes.source,
      vocal: villaNotes.vocal,
      resolu: villaNotes.resolu,
      createdAt: villaNotes.createdAt,
    })
    .from(villaNotes)
    .leftJoin(villas, eq(villaNotes.villaId, villas.id))
    .where(villaChoisie ? and(eq(villaNotes.villaId, villaChoisie)) : undefined)
    .orderBy(desc(villaNotes.createdAt))
    .limit(300);

  const apresEtat = seulementOuvertes ? toutes.filter((n) => !n.resolu) : toutes;
  const parCategorie = new Map<string, number>();
  for (const n of apresEtat) parCategorie.set(n.categorie, (parCategorie.get(n.categorie) ?? 0) + 1);
  const notes = categorieChoisie ? apresEtat.filter((n) => n.categorie === categorieChoisie) : apresEtat;

  const base: Params = { villa: villaChoisie, etat: seulementOuvertes ? "ouvertes" : "" };
  const puce = (actif: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
      actif ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="text-sm text-muted-foreground">
          Suivi de chaque logement par catégorie : état, travaux, aléas, cautions et argent, demandes. Les vocaux envoyés à l&apos;agent
          Telegram arrivent ici, déjà classés.
        </p>
      </div>

      <NotesFormulaire
        logements={logements.map((l) => ({ id: l.id, nom: l.nom }))}
        villaInitiale={villaChoisie}
        categorieInitiale={categorieChoisie}
      />

      <div className="space-y-3">
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
          <Link href={lien({ ...base, cat: "" })} className={puce(!categorieChoisie)}>
            Toutes · {apresEtat.length}
          </Link>
          {CATEGORIES_NOTES.map((c) => (
            <Link key={c.key} href={lien({ ...base, cat: c.key })} className={puce(categorieChoisie === c.key)}>
              {c.label} · {parCategorie.get(c.key) ?? 0}
            </Link>
          ))}
        </div>
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
          <Link href={lien({ cat: categorieChoisie, etat: base.etat })} className={puce(!villaChoisie)}>
            Tous les logements
          </Link>
          {logements.map((l) => (
            <Link key={l.id} href={lien({ villa: l.id, cat: categorieChoisie, etat: base.etat })} className={puce(villaChoisie === l.id)}>
              {l.nom}
            </Link>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
          <Link
            href={lien({ villa: villaChoisie, cat: categorieChoisie, etat: seulementOuvertes ? "" : "ouvertes" })}
            className={puce(seulementOuvertes)}
            aria-pressed={seulementOuvertes}
          >
            À traiter
          </Link>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucune note pour ce filtre.</div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className={cn("rounded-xl border bg-card p-4", n.resolu && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{libelleCategorieNote(n.categorie)}</span>
                <span className="font-medium text-foreground">{n.villaNom ?? "Général"}</span>
                <span>·</span>
                <span>{dateFr.format(n.createdAt)}</span>
                <span>·</span>
                <span>{n.auteurNom}</span>
                {n.source === "telegram" ? (
                  <span className="inline-flex items-center gap-1" title={n.vocal ? "Dicté en vocal sur Telegram" : "Écrit sur Telegram"}>
                    {n.vocal ? <Mic className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                    Telegram
                  </span>
                ) : null}
                {n.resolu ? <span className="font-medium text-emerald-600 dark:text-emerald-400">Traité</span> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{n.texte}</p>
              {n.montant ? (
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {Number(n.montant).toLocaleString("fr-FR")} {n.devise ?? ""}
                </p>
              ) : null}
              <div className="mt-3">
                <NoteActions id={n.id} resolu={n.resolu} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
