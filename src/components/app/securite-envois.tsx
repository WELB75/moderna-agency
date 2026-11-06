"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, CheckCheck, Clock, Loader2, Plus, Send, ShieldCheck, UserRound, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ajouterAgentSecurite, envoyerSecuriteManuel, retirerAgentSecurite } from "@/lib/actions/securite";
import type { AgentSecurite, EnvoiSecurite } from "@/lib/securite-agents";
import { cn } from "@/lib/utils";

// Espace « Envois à la sécurité » de l'onglet Sécurité (Kamel, 2026-11-06) : qui sont les agents
// de chaque domaine, et pour chaque arrivée, à qui le message est parti et s'il est arrivé / lu.

export type DossierSecurite = {
  reservationId: string;
  guestName: string;
  villaNom: string;
  arrivee: string;
  aVenir: boolean;
  passeports: string | null; // « 11/12 passeports », null si fiche terminée ou inconnue
  ficheComplete: boolean;
  envois: EnvoiSecurite[];
};

const STATUTS: Record<EnvoiSecurite["statut"], { label: string; icon: typeof Check; className: string }> = {
  accepte: { label: "En cours", icon: Clock, className: "border-border bg-muted/50 text-muted-foreground" },
  envoye: { label: "Envoyé", icon: Check, className: "border-border bg-muted/50 text-foreground" },
  delivre: {
    label: "Délivré",
    icon: CheckCheck,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  lu: { label: "Lu", icon: CheckCheck, className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  echec: { label: "Échec", icon: XCircle, className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
};

function StatutEnvoi({ envoi }: { envoi: EnvoiSecurite | undefined }) {
  if (!envoi) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
        Pas encore envoyé
      </span>
    );
  }
  const s = STATUTS[envoi.statut];
  const Icone = s.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.className)}
      title={envoi.erreur ?? undefined}
    >
      <Icone className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function telAffiche(phone: string) {
  return phone.replace(/^\+212/, "0");
}

export function AgentsSecuriteEditor({ domaineId, domaineNom, agents }: { domaineId: string; domaineNom: string; agents: AgentSecurite[] }) {
  const [ajout, setAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [phone, setPhone] = useState("");
  const [enCours, start] = useTransition();

  function ajouter(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await ajouterAgentSecurite(domaineId, nom, phone);
        toast.success(`${nom.trim()} ajouté aux agents de ${domaineNom}.`);
        setNom("");
        setPhone("");
        setAjout(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ajout impossible.");
      }
    });
  }

  function retirer(a: AgentSecurite) {
    if (!window.confirm(`Retirer ${a.nom} (${telAffiche(a.phone)}) des agents de ${domaineNom} ?`)) return;
    start(async () => {
      try {
        await retirerAgentSecurite({ id: a.id, domaineId });
        toast.success(`${a.nom} retiré.`);
      } catch {
        toast.error("Impossible de retirer cet agent.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">Agents de sécurité :</p>
        {agents.length === 0 ? <span className="text-xs text-red-600 dark:text-red-400">aucun — ajoute au moins un numéro</span> : null}
        {agents.map((a) => (
          <span key={`${a.id}-${a.phone}`} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-2 pr-1 text-xs">
            <UserRound className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{a.nom}</span>
            <span className="tabular-nums text-muted-foreground">{telAffiche(a.phone)}</span>
            <button
              type="button"
              onClick={() => retirer(a)}
              disabled={enCours}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Retirer ${a.nom}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!ajout ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAjout(true)} className="h-7 px-2 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Ajouter un agent
          </Button>
        ) : null}
      </div>
      {ajout ? (
        <form onSubmit={ajouter} className="flex flex-col gap-2 sm:flex-row">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex. Gardien nuit)" className="sm:max-w-48" required />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp (ex. 0661…)"
            inputMode="tel"
            className="sm:max-w-48"
            required
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ajouter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAjout(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function EnvoisSecurite({ dossiers, agents }: { dossiers: DossierSecurite[]; agents: AgentSecurite[] }) {
  const aVenir = dossiers.filter((d) => d.aVenir);
  const passes = dossiers.filter((d) => !d.aVenir);
  return (
    <div className="space-y-3">
      {aVenir.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucune arrivée dans les 4 prochains jours.
        </p>
      ) : (
        aVenir.map((d) => <DossierRow key={d.reservationId} dossier={d} agents={agents} />)
      )}
      {passes.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Envois des 30 derniers jours ({passes.length})
          </summary>
          <div className="mt-2 space-y-2">
            {passes.map((d) => (
              <DossierRow key={d.reservationId} dossier={d} agents={agents} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function DossierRow({ dossier, agents }: { dossier: DossierSecurite; agents: AgentSecurite[] }) {
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, start] = useTransition();
  const dejaEnvoye = dossier.envois.length > 0;

  // Dernier envoi par numéro (le journal est trié du plus récent au plus ancien).
  const dernierParNumero = new Map<string, EnvoiSecurite>();
  for (const e of dossier.envois) if (!dernierParNumero.has(e.destinataire)) dernierParNumero.set(e.destinataire, e);
  const lignes: { cle: string; nom: string; phone: string; envoi: EnvoiSecurite | undefined }[] = dossier.aVenir
    ? agents.map((a) => ({ cle: a.phone, nom: a.nom, phone: a.phone, envoi: dernierParNumero.get(a.phone) }))
    : [];
  // Numéros prévenus qui ne sont plus (ou pas) dans la liste des agents : affichés quand même.
  for (const [phone, envoi] of dernierParNumero) {
    if (!lignes.some((l) => l.phone === phone)) lignes.push({ cle: phone, nom: envoi.agentNom ?? "Ancien numéro", phone, envoi });
  }

  function envoyer() {
    start(async () => {
      try {
        const { resultats, erreur } = await envoyerSecuriteManuel(dossier.reservationId);
        if (erreur) return void toast.error(erreur);
        const ok = resultats.filter((r) => r.ok).length;
        if (ok === resultats.length) toast.success(`Message sécurité envoyé à ${ok} agent${ok > 1 ? "s" : ""}.`);
        else if (ok > 0) toast.warning(`Envoyé à ${ok} agent(s) sur ${resultats.length} — voir les échecs ci-dessous.`);
        else toast.error("Meta a refusé l'envoi — voir le détail ci-dessous.");
      } catch {
        toast.error("Envoi impossible.");
      } finally {
        setConfirmer(false);
      }
    });
  }

  const dernier = dossier.envois[0];
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">
            {dossier.villaNom} <span className="font-normal text-muted-foreground">· {dossier.guestName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Arrivée {dossier.arrivee}
            {dossier.passeports ? ` · ${dossier.passeports}` : dossier.ficheComplete ? " · fiche police complète" : ""}
          </p>
          {dernier ? (
            <p className="text-xs text-muted-foreground">
              Dernier envoi {format(new Date(dernier.createdAt), "EEE d MMM 'à' HH:mm", { locale: fr })} ·{" "}
              {dernier.mode === "manuel" ? "manuel" : "automatique"}
            </p>
          ) : null}
        </div>
        {dossier.aVenir ? (
          <Button
            type="button"
            size="sm"
            variant={dejaEnvoye ? "outline" : "default"}
            onClick={() => setConfirmer(true)}
            disabled={enCours || agents.length === 0}
          >
            {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dejaEnvoye ? <ShieldCheck className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {dejaEnvoye ? "Renvoyer" : "Envoyer à la sécurité"}
          </Button>
        ) : null}
      </div>

      {lignes.length > 0 ? (
        <ul className="mt-3 divide-y rounded-lg border">
          {lignes.map((l) => (
            <li key={l.cle} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{l.nom}</span>{" "}
                <span className="tabular-nums text-muted-foreground">{telAffiche(l.phone)}</span>
                {l.envoi?.statut === "echec" && l.envoi.erreur ? (
                  <span className="block text-red-600 dark:text-red-400">{l.envoi.erreur}</span>
                ) : null}
              </span>
              <StatutEnvoi envoi={l.envoi} />
            </li>
          ))}
        </ul>
      ) : null}

      <AlertDialog open={confirmer} onOpenChange={setConfirmer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer à la sécurité ?</AlertDialogTitle>
            <AlertDialogDescription>
              {dossier.villaNom} — {dossier.guestName}, arrivée {dossier.arrivee}.
              {dossier.passeports ? ` Fiche police partielle (${dossier.passeports}) : le lien montrera les passeports déjà reçus.` : ""}{" "}
              Le message WhatsApp part à : {agents.map((a) => a.nom).join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={enCours}
              onClick={(e) => {
                e.preventDefault();
                envoyer();
              }}
            >
              {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Envoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
