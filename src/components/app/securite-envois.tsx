"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ajouterAgentSecurite, envoyerSecuriteManuel, repondreAgentSecurite, retirerAgentSecurite } from "@/lib/actions/securite";
import { texteModeleSecurite, type AgentSecurite, type DossierSecurite, type EnvoiSecurite, type MessageConversation } from "@/lib/securite-agents";
import { cn } from "@/lib/utils";

// Suivi sécurité (Kamel, 2026-11-06) : pour chaque arrivée, à quel agent le message est parti,
// où il en est (barre : envoyé → délivré → lu), et la conversation complète avec chaque agent.
// Pensé d'abord pour le téléphone : une carte par arrivée, tout se lit sans ouvrir de menu.

function telAffiche(phone: string) {
  return phone.replace(/^\+212/, "0").replace(/(\d{4})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
}

// ---------------------------------------------------------------------------------------------
// Barre de progression d'un envoi : 3 segments (Envoyé · Délivré · Lu). « accepte » = en cours
// (Meta a pris le message, pas encore confirmé parti) : premier segment animé. Échec : barre rouge.

const ETAPES = ["Envoyé", "Délivré", "Lu"] as const;
const NIVEAU: Record<EnvoiSecurite["statut"], number> = { accepte: 0, envoye: 1, delivre: 2, lu: 3, echec: -1 };

export function ProgressionEnvoi({ envoi, compact }: { envoi: EnvoiSecurite | null | undefined; compact?: boolean }) {
  const niveau = envoi ? NIVEAU[envoi.statut] : null;
  const echec = niveau === -1;
  const enCours = niveau === 0;
  return (
    <div className={cn("w-full", compact ? "space-y-1" : "space-y-1.5")}>
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={Math.max(0, niveau ?? 0)}>
        {ETAPES.map((_, i) => {
          const rempli = niveau !== null && niveau >= i + 1;
          return (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 overflow-hidden rounded-full bg-muted",
                echec && "bg-red-500/70",
                rempli && (i === 2 ? "bg-sky-500" : "bg-emerald-500")
              )}
            >
              {enCours && i === 0 ? <span className="block h-full w-1/2 animate-pulse rounded-full bg-emerald-500/60" /> : null}
            </span>
          );
        })}
      </div>
      <div className={cn("flex justify-between text-[10px] leading-none text-muted-foreground", compact && "sr-only")}>
        {echec ? (
          <span className="font-semibold text-red-600 dark:text-red-400">Échec — {envoi?.erreur ?? "raison inconnue"}</span>
        ) : niveau === null ? (
          <span>Pas encore envoyé</span>
        ) : (
          ETAPES.map((e, i) => (
            <span key={e} className={cn(niveau >= i + 1 && "font-semibold text-foreground", enCours && i === 0 && "text-foreground")}>
              {enCours && i === 0 ? "En cours…" : e}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function libelleStatut(envoi: EnvoiSecurite | null | undefined): string {
  if (!envoi) return "Pas encore envoyé";
  const quand = format(new Date(envoi.updatedAt), "d MMM HH:mm", { locale: fr });
  return { accepte: "En cours d'envoi", envoye: `Envoyé · ${quand}`, delivre: `Délivré · ${quand}`, lu: `Lu · ${quand}`, echec: "Échec" }[envoi.statut];
}

// ---------------------------------------------------------------------------------------------
// Agents d'un domaine : puces + ajout en ligne.

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
        {agents.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Aucun agent : ajoute au moins un numéro WhatsApp.
          </span>
        ) : null}
        {agents.map((a) => (
          <span key={`${a.id}-${a.phone}`} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-xs">
            <UserRound className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{a.nom}</span>
            <span className="tabular-nums text-muted-foreground">{telAffiche(a.phone)}</span>
            <button
              type="button"
              onClick={() => retirer(a)}
              disabled={enCours}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Retirer ${a.nom}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!ajout ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAjout(true)} className="h-7 rounded-full px-2.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Agent
          </Button>
        ) : null}
      </div>
      {ajout ? (
        <form onSubmit={ajouter} className="flex flex-col gap-2 sm:flex-row">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex. Gardien nuit)" className="sm:max-w-48" autoFocus required />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp (ex. 0661…)" inputMode="tel" className="sm:max-w-48" required />
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

// ---------------------------------------------------------------------------------------------
// Bouton d'envoi (forcé, même fiche partielle) avec confirmation.

export function BoutonEnvoyerSecurite({ dossier, agents, taille = "sm" }: { dossier: DossierSecurite; agents: AgentSecurite[]; taille?: "sm" | "default" }) {
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, start] = useTransition();
  const dejaEnvoye = dossier.envois.length > 0;

  function envoyer() {
    start(async () => {
      try {
        const { resultats, erreur } = await envoyerSecuriteManuel(dossier.reservationId);
        if (erreur) return void toast.error(erreur);
        const ok = resultats.filter((r) => r.ok).length;
        if (ok === resultats.length) toast.success(`Message sécurité envoyé à ${ok} agent${ok > 1 ? "s" : ""}.`);
        else if (ok > 0) toast.warning(`Envoyé à ${ok} agent(s) sur ${resultats.length} — voir les échecs.`);
        else toast.error("Meta a refusé l'envoi — voir le détail.");
      } catch {
        toast.error("Envoi impossible.");
      } finally {
        setConfirmer(false);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size={taille}
        variant={dejaEnvoye ? "outline" : "default"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirmer(true);
        }}
        disabled={enCours || agents.length === 0}
        className="shrink-0"
      >
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dejaEnvoye ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        {dejaEnvoye ? "Renvoyer" : "Envoyer"}
      </Button>
      <AlertDialog open={confirmer} onOpenChange={setConfirmer}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
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
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Carte d'une arrivée (liste) : villa, voyageur, passeports, une barre par agent. Toute la carte
// ouvre le détail (conversation) ; le bouton Envoyer reste accessible sans l'ouvrir.

export function dernierEnvoiParAgent(dossier: DossierSecurite, agents: AgentSecurite[]) {
  const dernier = new Map<string, EnvoiSecurite>();
  for (const e of dossier.envois) if (!dernier.has(e.destinataire)) dernier.set(e.destinataire, e);
  const lignes: { phone: string; nom: string; envoi: EnvoiSecurite | undefined }[] = agents.map((a) => ({ phone: a.phone, nom: a.nom, envoi: dernier.get(a.phone) }));
  for (const [phone, envoi] of dernier) {
    if (!lignes.some((l) => l.phone === phone)) lignes.push({ phone, nom: envoi.agentNom ?? "Ancien numéro", envoi });
  }
  return lignes;
}

export function CarteArrivee({ dossier, agents }: { dossier: DossierSecurite; agents: AgentSecurite[] }) {
  const lignes = dernierEnvoiParAgent(dossier, agents);
  const tousLus = lignes.length > 0 && lignes.every((l) => l.envoi?.statut === "lu");
  const unEchec = lignes.some((l) => l.envoi?.statut === "echec");
  const rienEnvoye = lignes.every((l) => !l.envoi);
  return (
    <Link
      href={`/securite/envois/${dossier.reservationId}`}
      className={cn(
        "block rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 sm:p-4",
        unEchec && "border-red-500/40",
        tousLus && "border-sky-500/30",
        rienEnvoye && dossier.aVenir && "border-amber-500/40"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            tousLus ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : unEchec ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"
          )}
        >
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold">
            {dossier.villaNom}
            {dossier.villaNumero ? <span className="font-normal text-muted-foreground"> n°{dossier.villaNumero}</span> : null}
          </p>
          <p className="truncate text-sm">{dossier.guestName}</p>
          <p className="text-xs text-muted-foreground">
            Arrivée {dossier.arrivee}
            {dossier.passeports ? (
              <span className="ml-1.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">{dossier.passeports}</span>
            ) : dossier.ficheComplete ? (
              <span className="ml-1.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">passeports complets</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {dossier.aVenir ? <BoutonEnvoyerSecurite dossier={dossier} agents={agents} /> : null}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {lignes.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {lignes.map((l) => (
            <li key={l.phone} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{l.nom}</span>
                <span className={cn("shrink-0 text-muted-foreground", l.envoi?.statut === "echec" && "font-semibold text-red-600 dark:text-red-400")}>
                  {libelleStatut(l.envoi)}
                </span>
              </div>
              <ProgressionEnvoi envoi={l.envoi} compact />
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------
// Détail : message envoyé, lien, et fil avec chaque agent.

export function LienSecurite({ lien }: { lien: string }) {
  function copier() {
    navigator.clipboard.writeText(lien).then(() => toast.success("Lien copié."));
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-2 text-xs">{lien}</code>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={lien} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Vérifier le lien
          </a>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={copier}>
          <Copy className="h-3.5 w-3.5" />
          Copier
        </Button>
      </div>
    </div>
  );
}

function Bulle({ m }: { m: MessageConversation }) {
  const sortant = m.sens === "sortant";
  const { texte, lien } = m.estModeleSecurite ? texteModeleSecurite(m.contenu) : { texte: m.contenu, lien: null };
  const arabe = /[؀-ۿ]/.test(texte);
  const Coche = m.statut === "lu" || m.statut === "delivre" ? CheckCheck : Check;
  return (
    <div className={cn("flex", sortant ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
          sortant ? "rounded-br-sm bg-emerald-500/15 dark:bg-emerald-500/20" : "rounded-bl-sm border bg-background"
        )}
      >
        {m.estModeleSecurite ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Message sécurité</p>
        ) : null}
        {m.canal === "vocal" ? (
          <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Mic className="h-3 w-3" /> Vocal{m.sens === "entrant" ? " (transcrit)" : ""}
          </p>
        ) : null}
        <p dir={arabe ? "rtl" : "ltr"} className={cn("whitespace-pre-wrap break-words leading-relaxed", arabe && "text-right text-[15px]")}>
          {lien ? (
            <>
              {texte.split(lien)[0]}
              <a href={lien} target="_blank" rel="noreferrer" dir="ltr" className="break-all text-primary underline">
                {lien}
              </a>
              {texte.split(lien)[1]}
            </>
          ) : (
            texte
          )}
        </p>
        {m.audioUrl ? <audio controls preload="none" src={m.audioUrl} className="mt-1 h-8 w-full" /> : null}
        <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground")} dir="ltr">
          {format(new Date(m.createdAt), "d MMM HH:mm", { locale: fr })}
          {sortant ? (
            m.statut === "echec" ? (
              <span className="text-red-600 dark:text-red-400" title={m.erreur ?? undefined}>
                · échec
              </span>
            ) : (
              <Coche className={cn("h-3.5 w-3.5", m.statut === "lu" ? "text-sky-500" : "")} />
            )
          ) : null}
        </p>
        {sortant && m.statut === "echec" && m.erreur ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{m.erreur}</p> : null}
      </div>
    </div>
  );
}

export function ConversationAgent({
  agent,
  envoi,
  messages,
  fenetreOuverte,
  reservationId,
}: {
  agent: { nom: string; phone: string };
  envoi: EnvoiSecurite | undefined;
  messages: MessageConversation[];
  fenetreOuverte: boolean;
  reservationId: string;
}) {
  const [texte, setTexte] = useState("");
  const [enCours, start] = useTransition();
  const router = useRouter();
  const fin = useRef<HTMLDivElement>(null);
  const aRepondu = messages.some((m) => m.sens === "entrant");

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const t = texte.trim();
    if (!t) return;
    start(async () => {
      try {
        await repondreAgentSecurite(agent.phone, t, reservationId);
        setTexte("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error && !err.message.includes("Server Components") ? err.message : "Envoi impossible.");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="space-y-2 border-b p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{agent.nom}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{telAffiche(agent.phone)}</p>
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              aRepondu ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"
            )}
          >
            {aRepondu ? "A répondu" : "Pas de réponse"}
          </span>
        </div>
        <ProgressionEnvoi envoi={envoi} />
      </header>

      <div className="max-h-[28rem] space-y-2 overflow-y-auto bg-muted/30 p-3 sm:p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucun message échangé avec cet agent.</p>
        ) : (
          messages.map((m) => <Bulle key={m.id} m={m} />)
        )}
        <div ref={fin} />
      </div>

      {fenetreOuverte ? (
        <form onSubmit={envoyer} className="flex items-end gap-2 border-t p-2 sm:p-3">
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={`Répondre à ${agent.nom}…`}
            rows={1}
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                envoyer(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={enCours || !texte.trim()} aria-label="Envoyer">
            {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      ) : (
        <p className="border-t p-3 text-xs text-muted-foreground">
          Réponse possible ici seulement dans les 24 h après un message de l&apos;agent (règle WhatsApp). Sinon, « Renvoyer » ou écrire depuis le téléphone.
        </p>
      )}
    </section>
  );
}
