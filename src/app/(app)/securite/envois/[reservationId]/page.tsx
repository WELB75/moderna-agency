import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, CalendarDays, IdCard } from "lucide-react";
import { BoutonEnvoyerSecurite, ConversationAgent, LienSecurite } from "@/components/app/securite-envois";
import { dernierEnvoiParAgent, texteModeleSecurite } from "@/lib/securite-envois-util";
import { fenetreOuverte, getConversationAgent, getSuiviSecurite } from "@/lib/securite-agents";
import { getBaseUrl } from "@/lib/base-url";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Détail d'un dossier sécurité : le message tel que l'agent l'a reçu, le lien à vérifier (les
// passeports qu'il montre), et le fil complet avec chaque agent — réponse possible depuis l'app.
export default async function DossierSecuritePage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  const domaines = await getSuiviSecurite(nowInMorocco());
  const domaine = domaines.find((d) => d.dossiers.some((x) => x.reservationId === reservationId));
  const dossier = domaine?.dossiers.find((x) => x.reservationId === reservationId);
  if (!domaine || !dossier) notFound();

  const lignes = dernierEnvoiParAgent(dossier, domaine.agents);
  const conversations = await Promise.all(lignes.map((l) => getConversationAgent(l.phone)));
  const lien = `${getBaseUrl()}/securite/villa/${reservationId}`;
  const dernier = dossier.envois[0];
  const apercu = dernier ? texteModeleSecurite(dernier.contenu).texte : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/securite/envois" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Suivi sécurité
      </Link>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{domaine.nom}</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {dossier.villaNom}
              {dossier.villaNumero ? <span className="font-normal text-muted-foreground"> n°{dossier.villaNumero}</span> : null}
            </h1>
            <p className="text-sm">{dossier.guestName}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Arrivée {dossier.arrivee}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  dossier.passeports ? "text-amber-700 dark:text-amber-400" : dossier.ficheComplete ? "text-emerald-700 dark:text-emerald-400" : ""
                )}
              >
                <IdCard className="h-3.5 w-3.5" /> {dossier.passeports ?? (dossier.ficheComplete ? "Passeports complets" : "Fiche police : état inconnu")}
              </span>
            </div>
          </div>
          {dossier.aVenir ? <BoutonEnvoyerSecurite dossier={dossier} agents={domaine.agents} taille="default" /> : null}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lien envoyé à la sécurité</p>
          <LienSecurite lien={lien} />
          <p className="text-[11px] text-muted-foreground">
            Ouvre-le pour vérifier qu&apos;il affiche bien tous les passeports reçus — c&apos;est exactement ce que voit l&apos;agent.
          </p>
        </div>

        {apercu ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Message envoyé {dernier ? `· ${format(new Date(dernier.createdAt), "EEE d MMM 'à' HH:mm", { locale: fr })} · ${dernier.mode === "manuel" ? "manuel" : "automatique"}` : ""}
            </p>
            <p dir="rtl" className="whitespace-pre-wrap rounded-xl bg-emerald-500/10 p-3 text-right text-[15px] leading-relaxed">
              {apercu}
            </p>
          </div>
        ) : null}
      </div>

      {lignes.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun agent pour ce domaine : ajoute-en un depuis le suivi.</p>
      ) : (
        lignes.map((l, i) => (
          <ConversationAgent
            key={l.phone}
            agent={{ nom: l.nom, phone: l.phone }}
            envoi={l.envoi}
            messages={conversations[i]}
            fenetreOuverte={fenetreOuverte(conversations[i])}
            reservationId={reservationId}
          />
        ))
      )}
    </div>
  );
}
