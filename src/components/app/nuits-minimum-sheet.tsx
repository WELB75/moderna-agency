"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Info, Minus, Plus, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { modifierNuitsMinimum, type ResultatNuitsMin } from "@/lib/actions/nuits-minimum";

// Panneau latéral "Gérer le nombre de nuits minimum", calqué sur SuperHote v2 (capture du
// 2026-10-20) : valeur avec boutons − / +, période, jours de la semaine optionnels et
// application à d'autres hébergements. Ouvert en cliquant une case "Nombre de nuits minimum"
// d'un logement déplié dans la vue planning.

export type CibleNuitsMin = {
  villaId: string;
  villaNom: string;
  date: string; // YYYY-MM-DD, case cliquée
  minStay: number | null; // valeur actuelle (Beds24)
  nuitIsolee?: { nuits: number } | null; // la date fait partie d'une nuit isolée
};

export type LogementNuitsMin = { id: string; nom: string; beds24RoomId: string | null };

// Ordre lundi → dimanche (affichage), valeurs getUTCDay (0 = dimanche).
const JOURS = [
  { label: "Lu", valeur: 1 },
  { label: "Ma", valeur: 2 },
  { label: "Me", valeur: 3 },
  { label: "Je", valeur: 4 },
  { label: "Ve", valeur: 5 },
  { label: "Sa", valeur: 6 },
  { label: "Di", valeur: 0 },
];

const MAX_NUITS = 365;

export function NuitsMinimumSheet({
  cible,
  logements,
  onClose,
  onSaved,
}: {
  cible: CibleNuitsMin | null;
  logements: LogementNuitsMin[];
  onClose: () => void;
  onSaved: (villaIds: string[]) => void;
}) {
  return (
    <Sheet open={cible !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        {/* Formulaire recréé (key) à chaque case cliquée : il repart des valeurs de cette date. */}
        {cible ? (
          <FormulaireNuitsMin key={`${cible.villaId}:${cible.date}`} cible={cible} logements={logements} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FormulaireNuitsMin({
  cible,
  logements,
  onClose,
  onSaved,
}: {
  cible: CibleNuitsMin;
  logements: LogementNuitsMin[];
  onClose: () => void;
  onSaved: (villaIds: string[]) => void;
}) {
  const [minStay, setMinStay] = useState(() => (cible.nuitIsolee ? cible.nuitIsolee.nuits : Math.max(1, cible.minStay ?? 2)));
  const [debut, setDebut] = useState(cible.date);
  const [fin, setFin] = useState(cible.date);
  const [parJours, setParJours] = useState(false);
  const [jours, setJours] = useState<Set<number>>(() => new Set(JOURS.map((j) => j.valeur)));
  const [autres, setAutres] = useState(false);
  const [autresIds, setAutresIds] = useState<Set<string>>(() => new Set());
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<ResultatNuitsMin[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const autresLogements = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return logements.filter((l) => l.id !== cible.villaId && l.beds24RoomId && (!q || l.nom.toLowerCase().includes(q)));
  }, [logements, cible.villaId, recherche]);

  const toutCoche = jours.size === JOURS.length;
  const periodeValide = Boolean(debut && fin && fin >= debut);
  const peutValider = periodeValide && minStay >= 1 && (!parJours || jours.size > 0) && !isPending;

  function basculerJour(valeur: number) {
    setJours((prev) => {
      const next = new Set(prev);
      if (next.has(valeur)) next.delete(valeur);
      else next.add(valeur);
      return next;
    });
  }

  function basculerAutre(id: string) {
    setAutresIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function valider() {
    if (!peutValider) return;
    const villaIds = [cible.villaId, ...(autres ? [...autresIds] : [])];
    startTransition(async () => {
      try {
        const { nbDates, resultats } = await modifierNuitsMinimum({
          villaIds,
          debut,
          fin,
          minStay,
          joursSemaine: parJours ? [...jours] : null,
        });
        onSaved(villaIds);
        const toutOk = resultats.every((r) => r.beds24.ok && r.pricelabs.ok);
        if (toutOk) {
          toast.success(
            `${minStay} nuit${minStay > 1 ? "s" : ""} min. appliquée${minStay > 1 ? "s" : ""} sur ${nbDates} date${nbDates > 1 ? "s" : ""} (${resultats.length} logement${resultats.length > 1 ? "s" : ""}) : PriceLabs + Beds24 → Airbnb et Booking.com.`
          );
          onClose();
        } else {
          setResultats(resultats);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Modification impossible pour le moment.");
      }
    });
  }

  const dateLisible = format(parseISO(cible.date), "EEEE d MMMM yyyy", { locale: fr });

  return (
    <>
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg leading-snug font-semibold">Gérer le nombre de nuits minimum de {cible.villaNom}</SheetTitle>
          <SheetDescription className="first-letter:uppercase">À partir du {dateLisible}</SheetDescription>
        </SheetHeader>

        {resultats ? (
          <div className="space-y-3 p-4">
            <p className="text-sm font-medium">Résultat de la modification</p>
            {resultats.map((r) => (
              <div key={r.villaId} className="space-y-1.5 rounded-lg border p-3 text-sm">
                <p className="font-semibold">{r.villaNom}</p>
                <LigneResultat ok={r.beds24.ok} titre="Beds24 (Airbnb + Booking.com)" detail={r.beds24.detail} />
                <LigneResultat ok={r.pricelabs.ok} titre="PriceLabs" detail={r.pricelabs.detail} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <div className="flex gap-2.5 rounded-lg bg-muted/60 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="space-y-1">
                <p className="font-semibold">Nuits minimum pilotées par PriceLabs</p>
                <p className="text-muted-foreground">
                  Ta saisie est enregistrée dans PriceLabs (dérogation par date, elle ne sera pas écrasée à sa prochaine
                  optimisation) puis envoyée tout de suite à Beds24, donc à Airbnb et Booking.com.
                </p>
              </div>
            </div>

            {cible.nuitIsolee ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                Cette date fait partie d&apos;une nuit isolée ({cible.nuitIsolee.nuits} nuit{cible.nuitIsolee.nuits > 1 ? "s" : ""} libre
                {cible.nuitIsolee.nuits > 1 ? "s" : ""} entre deux séjours). Elle est normalement débloquée automatiquement.
              </p>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="nuits-min" className="text-sm font-medium">
                Nombre de nuits minimum
              </label>
              <div className="flex">
                <Input
                  id="nuits-min"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_NUITS}
                  value={minStay}
                  onChange={(e) => setMinStay(Math.min(MAX_NUITS, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                  className="rounded-r-none"
                />
                <button
                  type="button"
                  aria-label="Une nuit de moins"
                  onClick={() => setMinStay((n) => Math.max(1, n - 1))}
                  disabled={minStay <= 1}
                  className="flex w-11 items-center justify-center border-y border-l hover:bg-muted disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Une nuit de plus"
                  onClick={() => setMinStay((n) => Math.min(MAX_NUITS, n + 1))}
                  className="flex w-11 items-center justify-center rounded-r-lg border hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Période (arrivées concernées)</span>
              <div className="flex items-center gap-2">
                <Input type="date" aria-label="Premier jour" value={debut} onChange={(e) => setDebut(e.target.value)} />
                <span className="text-muted-foreground">→</span>
                <Input type="date" aria-label="Dernier jour (inclus)" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
              </div>
              {!periodeValide ? <p className="text-xs text-destructive">Le dernier jour doit être après le premier.</p> : null}
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Uniquement certains jours de la semaine</span>
                <Switch checked={parJours} onCheckedChange={setParJours} />
              </label>
              {parJours ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                  {JOURS.map((j) => (
                    <label key={j.valeur} className="flex flex-col items-center gap-1">
                      <span className="text-xs font-medium">{j.label}</span>
                      <Checkbox checked={jours.has(j.valeur)} onCheckedChange={() => basculerJour(j.valeur)} />
                    </label>
                  ))}
                  <label className="ml-auto flex flex-col items-center gap-1">
                    <span className="text-xs font-medium">Tout</span>
                    <Checkbox
                      checked={toutCoche}
                      onCheckedChange={() => setJours(toutCoche ? new Set() : new Set(JOURS.map((j) => j.valeur)))}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Appliquer à d&apos;autres hébergements</span>
                <Switch checked={autres} onCheckedChange={setAutres} />
              </label>
              {autres ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Rechercher" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="pl-8" />
                  </div>
                  <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                    <Checkbox
                      checked={autresLogements.length > 0 && autresLogements.every((l) => autresIds.has(l.id))}
                      onCheckedChange={(checked) =>
                        setAutresIds((prev) => {
                          const next = new Set(prev);
                          for (const l of autresLogements) {
                            if (checked) next.add(l.id);
                            else next.delete(l.id);
                          }
                          return next;
                        })
                      }
                    />
                    Tous les hébergements Beds24 ({autresLogements.length})
                  </label>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {autresLogements.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={autresIds.has(l.id)} onCheckedChange={() => basculerAutre(l.id)} />
                        <span className="truncate">{l.nom}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <SheetFooter className="flex-row gap-2 border-t">
          {resultats ? (
            <Button className="flex-1" onClick={onClose}>
              Fermer
            </Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={valider} disabled={!peutValider}>
                {isPending ? "Enregistrement…" : "Valider les modifications"}
              </Button>
            </>
          )}
        </SheetFooter>
    </>
  );
}

function LigneResultat({ ok, titre, detail }: { ok: boolean; titre: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
      <div>
        <p className="font-medium">{titre}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
