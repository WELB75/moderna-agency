"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Receipt, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enregistrerLignesReservation, enregistrerNotePaiement } from "@/lib/actions/compta-reservation";
import {
  CATEGORIES_LIGNES,
  arrondir,
  formaterMontant,
  libelleCategorie,
  lireNombre,
  montantLigne,
  suggererLignes,
  totalFacture,
  totalParCategorie,
  type CategorieLigne,
  type LigneFacture,
  type Ventilation,
} from "@/lib/compta-reservation-format";

type Props = {
  reservationId: string;
  nuits: number;
  devise: string;
  loyerTotal: number | null;
  fraisMenage: number | null;
  notesPaiement: string | null;
  moyenPaiement: string | null;
  lignes: LigneFacture[];
  ventilation: Ventilation;
};

type LigneEdition = { cle: string; categorie: CategorieLigne; libelle: string; quantite: string; prixUnitaire: string };

let compteur = 0;
const nouvelleCle = () => `l${++compteur}`;

function enEdition(l: LigneFacture): LigneEdition {
  return { cle: nouvelleCle(), categorie: l.categorie, libelle: l.libelle, quantite: String(l.quantite), prixUnitaire: String(l.prixUnitaire) };
}

export function ComptaReservationCard(props: Props) {
  const { devise, ventilation: v, lignes } = props;
  const [ouvert, setOuvert] = useState(false);
  const parCategorie = totalParCategorie(lignes);
  const coutsParType = {
    menage: v.couts.filter((c) => c.categorie === "menage"),
    cuisine: v.couts.filter((c) => c.categorie === "cuisine"),
    caisse: v.couts.filter((c) => c.categorie === "caisse"),
  };
  const aPrevoir = v.couts.some((c) => !c.reel);
  const solde = v.reste === 0 && (props.loyerTotal ?? v.facture) > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Détail financier</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
          {lignes.length > 0 ? "Modifier le détail" : "Détailler le séjour"}
        </Button>
      </header>

      {/* Les trois chiffres que la comptable cherche d'abord */}
      <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
        <Chiffre label="Facturé" valeur={formaterMontant(lignes.length > 0 ? v.facture : (props.loyerTotal ?? 0), devise)} />
        <Chiffre label="Encaissé" valeur={formaterMontant(v.encaisse, devise)} ton={v.encaisse > 0 ? "vert" : undefined} />
        <Chiffre label={solde ? "Soldé" : "Reste à encaisser"} valeur={solde ? "OK" : formaterMontant(v.reste, devise)} ton={solde ? "vert" : v.reste > 0 ? "ambre" : undefined} />
      </dl>

      {lignes.length > 0 ? (
        <div className="space-y-1.5">
          <Titre>Ce qui est facturé au client</Titre>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {lignes.map((l, i) => (
              <li key={l.id ?? i} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{l.libelle}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.quantite} × {formaterMontant(l.prixUnitaire, devise)}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">{formaterMontant(montantLigne(l), devise)}</p>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-muted/50 px-3 py-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formaterMontant(v.facture, devise)}</span>
            </li>
          </ul>
          {v.ecartFacture !== 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Écart de {formaterMontant(Math.abs(v.ecartFacture), devise)} avec le loyer enregistré ({formaterMontant(props.loyerTotal ?? 0, devise)}) : le détail dit{" "}
              {v.ecartFacture > 0 ? "plus" : "moins"}.
            </p>
          ) : null}
          {parCategorie.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              {parCategorie.map((c) => `${libelleCategorie(c.categorie)} ${formaterMontant(c.montant, devise)}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Rien n&apos;est détaillé : seul le loyer total est connu. Cliquer sur « Détailler le séjour » pour ventiler nuitées, ménage et options, comme le devis envoyé au client.
        </p>
      )}

      <div className="space-y-1.5">
        <Titre>Où va l&apos;argent</Titre>
        {v.couts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun ménage, cuisine ou dépense de caisse rattaché à ce séjour pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {([...coutsParType.menage, ...coutsParType.cuisine, ...coutsParType.caisse]).map((c) => (
              <li key={c.cle} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words">{c.libelle}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.reel ? "Caisse" : "Barème agence"}
                    {c.deviseOrigine !== devise ? ` · ${formaterMontant(c.montantOrigine, c.deviseOrigine)}` : ""}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">− {formaterMontant(c.montant, devise)}</p>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-muted/50 px-3 py-2 text-sm font-semibold">
              <span>Total des frais</span>
              <span className="tabular-nums">− {formaterMontant(v.totalCouts, devise)}</span>
            </li>
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
              <span>Encaissé moins frais</span>
              <span className="tabular-nums">{formaterMontant(v.solde, devise)}</span>
            </li>
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Avant commission de la plateforme (Airbnb, Booking). {aPrevoir ? "« Barème agence » : montant prévu selon les tarifs du personnel, pas encore sorti de la caisse." : ""}
        </p>
      </div>

      {props.notesPaiement || props.moyenPaiement ? (
        <div className="space-y-1">
          <Titre>Règlement</Titre>
          <p className="whitespace-pre-wrap break-words text-sm">
            {props.moyenPaiement ? <span className="font-medium">{props.moyenPaiement}</span> : null}
            {props.moyenPaiement && props.notesPaiement ? " · " : ""}
            {props.notesPaiement}
          </p>
        </div>
      ) : null}

      <EditeurDetail key={String(ouvert)} ouvert={ouvert} onOpenChange={setOuvert} {...props} />
    </section>
  );
}

function Titre({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Chiffre({ label, valeur, ton }: { label: string; valeur: string; ton?: "vert" | "ambre" }) {
  const couleur = ton === "vert" ? "text-emerald-700 dark:text-emerald-400" : ton === "ambre" ? "text-amber-700 dark:text-amber-400" : "";
  return (
    <div className="rounded-xl border border-border px-2 py-2.5">
      <dt className="text-[11px] text-muted-foreground sm:text-xs">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${couleur}`}>{valeur}</dd>
    </div>
  );
}

function EditeurDetail({
  ouvert,
  onOpenChange,
  reservationId,
  nuits,
  devise,
  loyerTotal,
  fraisMenage,
  notesPaiement,
  lignes,
}: Props & { ouvert: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<LigneEdition[]>(() => lignes.map(enEdition));
  const [note, setNote] = useState(notesPaiement ?? "");
  const [aligner, setAligner] = useState(false);
  const [enCours, startTransition] = useTransition();

  const total = useMemo(
    () => totalFacture(rows.map((r) => ({ categorie: r.categorie, libelle: r.libelle, quantite: lireNombre(r.quantite), prixUnitaire: lireNombre(r.prixUnitaire) }))),
    [rows]
  );
  const ecart = loyerTotal != null ? arrondir(total - loyerTotal) : 0;

  function maj(cle: string, champ: keyof LigneEdition, valeur: string) {
    setRows((prev) => prev.map((r) => (r.cle === cle ? { ...r, [champ]: valeur } : r)));
  }

  function ajouter(categorie: CategorieLigne) {
    const def = CATEGORIES_LIGNES.find((c) => c.id === categorie);
    const quantite = def && def.unite !== "forfait" ? String(Math.max(1, nuits)) : "1";
    setRows((prev) => [...prev, { cle: nouvelleCle(), categorie, libelle: def?.label ?? "", quantite, prixUnitaire: "" }]);
  }

  function preremplir() {
    const proposees = suggererLignes({ loyerTotal, fraisMenage, nuits });
    if (proposees.length === 0) {
      toast.error("Le loyer n'est pas renseigné : rien à proposer.");
      return;
    }
    setRows(proposees.map(enEdition));
  }

  function enregistrer() {
    startTransition(async () => {
      try {
        await enregistrerLignesReservation(
          reservationId,
          rows.map((r) => ({ categorie: r.categorie, libelle: r.libelle, quantite: r.quantite, prixUnitaire: r.prixUnitaire })),
          aligner
        );
        if ((notesPaiement ?? "") !== note.trim()) await enregistrerNotePaiement(reservationId, note);
        toast.success("Détail financier enregistré.");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[min(96vw,44rem)] max-w-none gap-4 overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Détail financier du séjour</DialogTitle>
          <DialogDescription>
            Une ligne par poste, comme le devis envoyé au client. Montants en {devise === "EUR" ? "euros" : devise}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES_LIGNES.map((c) => (
            <Button key={c.id} type="button" variant="outline" size="sm" onClick={() => ajouter(c.id)}>
              <Plus className="h-3.5 w-3.5" />
              {c.label}
            </Button>
          ))}
          {rows.length === 0 && loyerTotal ? (
            <Button type="button" variant="secondary" size="sm" onClick={preremplir}>
              <Wand2 className="h-3.5 w-3.5" />
              Proposer d&apos;après le loyer
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Ajouter un poste avec les boutons ci-dessus (séjour, ménage, cuisinière, piscine...).
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.cle} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input value={r.libelle} onChange={(e) => maj(r.cle, "libelle", e.target.value)} placeholder="Libellé" aria-label="Libellé" className="min-w-0 flex-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer la ligne"
                    onClick={() => setRows((prev) => prev.filter((x) => x.cle !== r.cle))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="space-y-0.5 text-xs text-muted-foreground">
                    Quantité
                    <Input inputMode="decimal" value={r.quantite} onChange={(e) => maj(r.cle, "quantite", e.target.value)} />
                  </label>
                  <label className="space-y-0.5 text-xs text-muted-foreground">
                    Prix unitaire
                    <Input inputMode="decimal" value={r.prixUnitaire} onChange={(e) => maj(r.cle, "prixUnitaire", e.target.value)} />
                  </label>
                  <p className="pb-2 text-right text-sm font-semibold tabular-nums">
                    {formaterMontant(montantLigne({ quantite: lireNombre(r.quantite), prixUnitaire: lireNombre(r.prixUnitaire) }), devise)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">{libelleCategorie(r.categorie)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm font-semibold">
          <span>Total facturé</span>
          <span className="tabular-nums">{formaterMontant(total, devise)}</span>
        </div>

        {rows.length > 0 && ecart !== 0 && loyerTotal != null ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={aligner} onChange={(e) => setAligner(e.target.checked)} />
            <span>
              Mettre le loyer de la réservation à {formaterMontant(total, devise)} (il est de {formaterMontant(loyerTotal, devise)}, écart {formaterMontant(Math.abs(ecart), devise)}).
            </span>
          </label>
        ) : null}

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Règlement</span>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ex. acompte de 762 € par virement au propriétaire, le reste en espèces à l'arrivée."
          />
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={enCours} onClick={enregistrer}>
            {enCours ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
