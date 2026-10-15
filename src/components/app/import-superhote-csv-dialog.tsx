"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyserHistoriqueSuperhote, importerHistoriqueSuperhote } from "@/lib/actions/superhote-historique";
import type { BilanImportSuperhote } from "@/lib/superhote-historique";

const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Import de l'historique Superhote en deux temps (Fouad, 2026-10-15) : un aperçu qui n'écrit rien
// (combien de réservations créées / complétées / ignorées, CA par année), puis l'import réel.
// Accepte l'export historique complet (superhote-historique-*.csv) comme l'ancien export CSV v1.
export function ImportSuperhoteCsvDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inclureFutures, setInclureFutures] = useState(false);
  const [bilan, setBilan] = useState<BilanImportSuperhote | null>(null);
  const [termine, setTermine] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reinitialiser() {
    setFile(null);
    setBilan(null);
    setTermine(false);
    setInclureFutures(false);
  }

  function analyser() {
    if (!file) return;
    startTransition(async () => {
      try {
        const text = await file.text();
        setBilan(await analyserHistoriqueSuperhote(text, { inclureFutures }));
        setTermine(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'analyse.");
      }
    });
  }

  function importer() {
    if (!file) return;
    startTransition(async () => {
      try {
        const text = await file.text();
        const resultat = await importerHistoriqueSuperhote(text, { inclureFutures });
        setBilan(resultat);
        setTermine(true);
        toast.success(
          `${resultat.crees ?? 0} réservation(s) créée(s), ${resultat.completees ?? 0} complétée(s), ${resultat.clientsCrees ?? 0} fiche(s) voyageur.`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'import.");
      }
    });
  }

  const rienAFaire = bilan !== null && bilan.aCreer + bilan.aCreerAnnulees + bilan.aCompleter + bilan.rattachees + bilan.clientsACreer === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reinitialiser();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4" />
          Importer historique Superhote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer l&apos;historique Superhote</DialogTitle>
          <DialogDescription>
            Fichier d&apos;export historique Superhote (ou l&apos;ancien export « Exporter les réservations »). Les
            réservations déjà présentes ne sont jamais dupliquées : seules les infos manquantes sont complétées.
            Rien n&apos;est envoyé (ménage, WhatsApp, Beds24).
          </DialogDescription>
        </DialogHeader>

        {!termine && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="csvFile">Fichier CSV</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setBilan(null);
                }}
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={inclureFutures}
                onCheckedChange={(v) => {
                  setInclureFutures(v === true);
                  setBilan(null);
                }}
                className="mt-0.5"
              />
              <span>
                Créer aussi les séjours après le 13/10/2026 absents de l&apos;app (déconseillé : depuis la bascule, c&apos;est
                Beds24 qui fait foi).
              </span>
            </label>
          </div>
        )}

        {bilan && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">
              {termine ? "Import terminé" : "Aperçu (rien n'est encore enregistré)"} — {bilan.totalLignes} ligne(s) lue(s)
            </p>
            <ul className="list-disc space-y-1 pl-4">
              {termine ? (
                <>
                  <li>{bilan.crees ?? 0} réservation(s) créée(s)</li>
                  <li>{bilan.completees ?? 0} réservation(s) existante(s) complétée(s) / rattachée(s)</li>
                  <li>{bilan.clientsCrees ?? 0} fiche(s) voyageur créée(s)</li>
                </>
              ) : (
                <>
                  <li>
                    {bilan.aCreer} séjour(s) à créer
                    {bilan.aCreerAnnulees > 0 ? ` + ${bilan.aCreerAnnulees} annulation(s) (archivées, hors statistiques)` : ""}
                  </li>
                  <li>{bilan.aCompleter} réservation(s) existante(s) à compléter (loyer, payé, caution, contact…)</li>
                  {bilan.rattachees > 0 && <li>{bilan.rattachees} déjà complète(s), fiche Superhote ajoutée</li>}
                  {bilan.dejaAJour > 0 && <li>{bilan.dejaAJour} déjà à jour</li>}
                  <li>{bilan.clientsACreer} fiche(s) voyageur à créer</li>
                </>
              )}
              {bilan.futuresIgnorees > 0 && <li>{bilan.futuresIgnorees} séjour(s) futur(s) absent(s) de l&apos;app, non créé(s) (Beds24 fait foi)</li>}
              {bilan.conflits > 0 && <li>{bilan.conflits} séjour(s) qui chevauchent une réservation de l&apos;app (ou annulés dans l&apos;app), non créé(s)</li>}
              {bilan.ignoreesIcal > 0 && <li>{bilan.ignoreesIcal} réservation(s) venant de l&apos;app elle-même (iCal), ignorée(s)</li>}
              {bilan.ignoreesDemandes > 0 && <li>{bilan.ignoreesDemandes} demande(s) non confirmée(s), ignorée(s)</li>}
              {bilan.ignoreesManuellement > 0 && <li>{bilan.ignoreesManuellement} réservation(s) déjà écartée(s) à la main dans l&apos;app, ignorée(s)</li>}
              {bilan.lignesLogementInconnu > 0 && (
                <li>
                  {bilan.lignesLogementInconnu} ligne(s) dont le logement est introuvable dans l&apos;app : {bilan.logementsInconnus.join(", ")}
                </li>
              )}
              {bilan.illisibles > 0 && <li>{bilan.illisibles} ligne(s) illisible(s)</li>}
            </ul>

            {bilan.parAnnee.length > 0 && (
              <table className="w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="font-normal">Année (arrivée)</th>
                    <th className="text-right font-normal">Séjours</th>
                    <th className="text-right font-normal">CA Superhote</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {bilan.parAnnee.map((a) => (
                    <tr key={a.annee}>
                      <td>{a.annee}</td>
                      <td className="text-right">{a.reservations}</td>
                      <td className="text-right">{euros(a.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {bilan.exemplesConflits.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Voir les chevauchements</summary>
                <ul className="mt-1 space-y-0.5">
                  {bilan.exemplesConflits.map((e, i) => (
                    <li key={i}>
                      {e.voyageur} — {e.logement} ({jourFr(e.arrivee)} → {jourFr(e.depart)})
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {bilan.exemplesFutures.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Voir les séjours futurs non créés</summary>
                <ul className="mt-1 space-y-0.5">
                  {bilan.exemplesFutures.map((e, i) => (
                    <li key={i}>
                      {e.voyageur} — {e.logement} ({jourFr(e.arrivee)} → {jourFr(e.depart)})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          {termine ? (
            <Button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Fermer
            </Button>
          ) : bilan ? (
            <Button type="button" disabled={isPending || rienAFaire} onClick={importer} className="w-full sm:w-auto">
              {isPending ? "Import en cours..." : rienAFaire ? "Rien à importer" : "Confirmer l'import"}
            </Button>
          ) : (
            <Button type="button" disabled={isPending || !file} onClick={analyser} className="w-full sm:w-auto">
              {isPending ? "Analyse..." : "Analyser le fichier"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
