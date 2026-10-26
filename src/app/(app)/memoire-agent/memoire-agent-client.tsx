"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { ajouterFiche, apprendreLotAction, basculerFiche, consoliderAction, modifierFiche, supprimerFiche } from "@/lib/actions/memoire-agent";
import { libelleTheme, THEMES } from "@/lib/messages-agent/memoire-regles";

export type FicheAffichee = {
  id: string;
  theme: string;
  titre: string;
  question: string;
  reponse: string;
  villaNom: string | null;
  actif: boolean;
  epingle: boolean;
  nbSources: number;
};

type Stats = { fils: number; filsAnalyses: number; echanges: number; fiches: number; fichesActives: number; derniere: string | null };

export function MemoireAgentClient({ fiches, stats }: { fiches: FicheAffichee[]; stats: Stats }) {
  const router = useRouter();
  const [progression, setProgression] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ajout, setAjout] = useState(false);

  // Lit les fils par lots (chaque lot est un appel serveur de moins de 5 minutes), puis consolide
  // les thèmes concernés. S'arrête si un lot n'avance plus (évite de tourner en boucle).
  async function apprendre(mode: "tout" | "recents") {
    setEnCours(true);
    const total = { analyses: 0, vides: 0, erreurs: 0, echanges: 0 };
    try {
      for (let tour = 0; tour < 300; tour++) {
        const b = await apprendreLotAction(mode);
        total.analyses += b.analyses;
        total.vides += b.vides;
        total.erreurs += b.erreurs;
        total.echanges += b.echanges;
        setProgression(`Lecture des conversations : ${total.analyses + total.vides} lues, ${total.echanges} échanges retenus${b.restants > 0 ? `, encore ${b.restants} à lire…` : "…"}`);
        if (b.restants === 0 || b.analyses + b.vides + b.erreurs === 0) break;
      }
      let fichesCreees = 0;
      for (let tour = 0; tour < 40; tour++) {
        setProgression(`Rédaction des fiches${fichesCreees ? ` (${fichesCreees} créées)` : ""}…`);
        const c = await consoliderAction();
        fichesCreees += c.fiches;
        if (c.restants === 0 || c.faits === 0) break;
      }
      toast.success(`Mémoire à jour : ${total.analyses} conversations analysées, ${fichesCreees} fiches rédigées.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apprentissage impossible.");
    } finally {
      setProgression(null);
      setEnCours(false);
    }
  }

  const parTheme = new Map<string, FicheAffichee[]>();
  for (const f of fiches) parTheme.set(f.theme, [...(parTheme.get(f.theme) ?? []), f]);
  const ordre = THEMES.map((t) => t.code as string).filter((c) => parTheme.has(c));
  for (const c of parTheme.keys()) if (!ordre.includes(c)) ordre.push(c);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Chiffre valeur={stats.filsAnalyses} libelle="conversations analysées" />
            <Chiffre valeur={stats.echanges} libelle="échanges retenus" />
            <Chiffre valeur={stats.fichesActives} libelle="fiches actives" />
            <Chiffre valeur={stats.fils - stats.filsAnalyses} libelle="sans échange utile" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => apprendre("tout")} disabled={enCours} className="bg-[#660033] text-white hover:bg-[#660033]/90 max-md:h-11">
              <Brain className="h-4 w-4" />
              Apprendre de tout l&apos;historique
            </Button>
            <Button variant="outline" onClick={() => apprendre("recents")} disabled={enCours} className="max-md:h-11">
              <RefreshCw className={`h-4 w-4 ${enCours ? "animate-spin" : ""}`} />
              Ajouter les nouveaux messages
            </Button>
          </div>
          {progression ? <p className="text-sm text-muted-foreground">{progression}</p> : null}
          <p className="text-xs text-muted-foreground">
            Les nouveaux messages sont aussi appris automatiquement chaque nuit. Une fiche que tu corriges ou ajoutes à la main
            n&apos;est jamais réécrite ; une fiche que tu désactives n&apos;est plus utilisée et n&apos;est pas recréée.
            {stats.derniere ? ` Dernière lecture : ${new Date(stats.derniere).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}.` : ""}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setAjout((v) => !v)} className="max-md:h-10">
          <Plus className="h-4 w-4" />
          Ajouter une fiche à la main
        </Button>
      </div>
      {ajout ? <FormulaireAjout onFait={() => setAjout(false)} /> : null}

      {fiches.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucune fiche pour l&apos;instant. Clique sur « Apprendre de tout l&apos;historique » : l&apos;agent lit les conversations Airbnb et Booking.com puis rédige ses fiches (compte quelques minutes).
        </p>
      ) : (
        ordre.map((theme) => (
          <section key={theme} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{libelleTheme(theme)}</h2>
            <div className="space-y-2">
              {(parTheme.get(theme) ?? []).map((f) => (
                <FicheCarte key={f.id} fiche={f} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Chiffre({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
      <p className="text-xs text-muted-foreground">{libelle}</p>
    </div>
  );
}

function FicheCarte({ fiche }: { fiche: FicheAffichee }) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(fiche.titre);
  const [question, setQuestion] = useState(fiche.question);
  const [reponse, setReponse] = useState(fiche.reponse);
  const [actif, setActif] = useState(fiche.actif);
  const [isPending, startTransition] = useTransition();

  function enregistrer() {
    startTransition(async () => {
      try {
        await modifierFiche(fiche.id, { titre, question, reponse });
        toast.success("Fiche enregistrée.");
        setEdition(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function basculer(valeur: boolean) {
    setActif(valeur);
    basculerFiche(fiche.id, valeur).catch(() => {
      setActif(!valeur);
      toast.error("Impossible de modifier la fiche.");
    });
  }

  return (
    <Card className={actif ? "" : "opacity-60"}>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {edition ? (
              <Input value={titre} onChange={(e) => setTitre(e.target.value)} aria-label="Titre" />
            ) : (
              <p className="font-medium">{fiche.titre}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {fiche.villaNom ? <Badge variant="outline">{fiche.villaNom}</Badge> : <Badge variant="outline">Tous les logements</Badge>}
              {fiche.epingle ? <Badge variant="outline">Écrite ou corrigée à la main</Badge> : <Badge variant="outline">{fiche.nbSources} échange{fiche.nbSources > 1 ? "s" : ""}</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Switch checked={actif} onCheckedChange={basculer} aria-label={actif ? "Désactiver la fiche" : "Activer la fiche"} />
            <Button variant="ghost" size="icon" className="max-md:h-10 max-md:w-10" onClick={() => setEdition((v) => !v)} aria-label="Modifier la fiche">
              <Pencil className="h-4 w-4" />
            </Button>
            <ConfirmDeleteButton
              title="Supprimer cette fiche ?"
              description="L'agent ne s'en servira plus. Elle pourra être recréée si les conversations en reparlent : pour l'éviter, désactive-la plutôt."
              action={async () => {
                await supprimerFiche(fiche.id);
                toast.success("Fiche supprimée.");
              }}
            />
          </div>
        </div>

        {edition ? (
          <div className="space-y-2">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} aria-label="Question type" />
            <Textarea value={reponse} onChange={(e) => setReponse(e.target.value)} rows={5} aria-label="Réponse type" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEdition(false)} className="max-md:h-10">
                Annuler
              </Button>
              <Button size="sm" onClick={enregistrer} disabled={isPending} className="bg-[#660033] text-white hover:bg-[#660033]/90 max-md:h-10">
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Question : </span>
              {fiche.question}
            </p>
            <p className="whitespace-pre-line">
              <span className="text-muted-foreground">Réponse : </span>
              {fiche.reponse}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormulaireAjout({ onFait }: { onFait: () => void }) {
  const [theme, setTheme] = useState<string>("autre");
  const [titre, setTitre] = useState("");
  const [question, setQuestion] = useState("");
  const [reponse, setReponse] = useState("");
  const [isPending, startTransition] = useTransition();

  function ajouter() {
    startTransition(async () => {
      try {
        await ajouterFiche(theme, { titre, question, reponse });
        toast.success("Fiche ajoutée.");
        onFait();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm" aria-label="Thème">
          {THEMES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.libelle}
            </option>
          ))}
        </select>
        <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre (ex. Arrivée tardive après minuit)" />
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Question type du voyageur" />
        <Textarea value={reponse} onChange={(e) => setReponse(e.target.value)} rows={4} placeholder="Ce que l'équipe répond" />
        <Button onClick={ajouter} disabled={isPending} className="bg-[#660033] text-white hover:bg-[#660033]/90 max-md:h-11">
          Ajouter
        </Button>
      </CardContent>
    </Card>
  );
}
