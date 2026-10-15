"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Home,
  Loader2,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { VillaSecurityBlock, type VillaSecurityData } from "@/components/app/villa-security-block";
import { chargerSecuriteLogement } from "@/lib/actions/securite";
import { toWhatsAppUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { ficheACompleter } from "@/lib/securite-fiche";
import type { SecuriteLogementResume, SecuriteStatut } from "@/lib/security-data";

type Sejour = NonNullable<SecuriteLogementResume["sejour"]>;

const FILTRES = [
  { id: "tous", label: "Tous", test: () => true },
  { id: "arrivees", label: "Arrivées du jour", test: (l: SecuriteLogementResume) => l.statut === "arrivee" },
  { id: "sur_place", label: "Sur place", test: (l: SecuriteLogementResume) => l.statut === "occupe" || l.statut === "depart" },
  { id: "a_completer", label: "À compléter", test: (l: SecuriteLogementResume) => ficheACompleter(l.sejour) },
  { id: "libres", label: "Libres", test: (l: SecuriteLogementResume) => l.statut === "libre" || l.statut === "bloque" },
] as const;

type FiltreId = (typeof FILTRES)[number]["id"];

export function SecuriteLogements({ logements }: { logements: SecuriteLogementResume[] }) {
  const [filtre, setFiltre] = useState<FiltreId>("tous");
  const actif = FILTRES.find((f) => f.id === filtre) ?? FILTRES[0];
  const visibles = logements.filter((l) => actif.test(l));

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTRES.map((f) => {
          const n = logements.filter((l) => f.test(l)).length;
          const selectionne = f.id === filtre;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltre(f.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selectionne
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 tabular-nums",
                  selectionne
                    ? "bg-primary-foreground/20"
                    : f.id === "a_completer" && n > 0
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-muted"
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun logement dans ce filtre.
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map((l) => (
            <LogementRow key={l.villaId} logement={l} />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUTS: Record<SecuriteStatut, { label: string; className: string }> = {
  arrivee: {
    label: "Arrivée aujourd'hui",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  depart: {
    label: "Départ aujourd'hui",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  occupe: { label: "Occupé", className: "border-primary/30 bg-primary/10 text-primary" },
  bloque: {
    label: "Bloqué",
    className: "border-yellow-500/40 bg-yellow-400/15 text-yellow-700 dark:text-yellow-300",
  },
  libre: { label: "Libre", className: "border-border bg-muted/40 text-muted-foreground" },
};

function StatutBadge({ statut, canal }: { statut: SecuriteStatut; canal: string | null }) {
  const s = STATUTS[statut];
  const label =
    statut === "bloque" && canal?.startsWith("Blocage") ? canal.replace(/^Blocage\s*·\s*/, "Bloqué · ") : s.label;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.className)}>
      {label}
    </span>
  );
}

function FicheChip({ sejour }: { sejour: Sejour }) {
  const { fiche, personnesEnregistrees: n, personnesAttendues: attendus } = sejour;
  // "2/4 pers." seulement s'il manque du monde ; sinon juste le nombre de personnes enregistrées
  // (les effectifs de la réservation sont parfois sous-estimés : jamais de "6/5").
  const compte =
    attendus !== null && n < attendus ? `${n}/${attendus} pers.` : `${n} pers. enregistrée${n > 1 ? "s" : ""}`;

  let tone = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  let Icon = ShieldCheck;
  let texte = `Fiche police complète · ${compte}`;
  if (fiche === "non_requise") {
    tone = "border-border bg-muted/40 text-muted-foreground";
    Icon = Users;
    texte = "Fiche police non requise";
  } else if (fiche === "absente") {
    tone = "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
    Icon = ShieldAlert;
    texte = "Fiche police manquante";
  } else if (fiche === "en_attente") {
    tone = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    Icon = ShieldAlert;
    texte = "Lien envoyé · fiche pas encore remplie";
  } else if (ficheACompleter(sejour)) {
    tone = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    Icon = ShieldAlert;
    texte = `Fiche police partielle · ${compte}`;
  }

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", tone)}>
      <Icon className="h-3.5 w-3.5" />
      {texte}
    </span>
  );
}

function personnes(sejour: Sejour): string | null {
  if (sejour.nbAdultes === null) return null;
  const a = `${sejour.nbAdultes} adulte${sejour.nbAdultes > 1 ? "s" : ""}`;
  return sejour.nbEnfants ? `${a}, ${sejour.nbEnfants} enfant${sejour.nbEnfants > 1 ? "s" : ""}` : a;
}

function LogementRow({ logement }: { logement: SecuriteLogementResume }) {
  const { villaId, nom, numero, type, statut, sejour, prochaineArrivee } = logement;
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState<VillaSecurityData | null | undefined>(undefined);
  const [chargement, startChargement] = useTransition();
  const Icone = type === "appartement" ? Building2 : Home;
  const reservationId = sejour && statut !== "bloque" ? sejour.reservationId : null;
  const alerte = ficheACompleter(sejour);

  function basculer() {
    const suivant = !ouvert;
    setOuvert(suivant);
    if (suivant && detail === undefined) {
      startChargement(async () => {
        try {
          setDetail(await chargerSecuriteLogement(villaId, reservationId));
        } catch {
          toast.error("Impossible de charger les pièces d'identité.");
          setOuvert(false);
        }
      });
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        alerte && (statut === "arrivee" || statut === "occupe" || statut === "depart") && "border-red-500/30"
      )}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            statut === "libre" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}
        >
          <Icone className="h-4 w-4" />
        </span>

        <button type="button" onClick={basculer} className="min-w-0 flex-1 space-y-1.5 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{nom}</span>
            {numero ? <span className="text-xs text-muted-foreground">n°{numero}</span> : null}
            <StatutBadge statut={statut} canal={sejour?.canal ?? null} />
          </div>

          {sejour && statut !== "bloque" ? (
            <>
              <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                <span className="font-medium">{sejour.guestName}</span>
                {sejour.canal ? <span className="text-muted-foreground">· {sejour.canal}</span> : null}
                {personnes(sejour) ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    · <Users className="h-3.5 w-3.5" /> {personnes(sejour)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className={cn(sejour.arriveeAujourdhui && "font-medium text-foreground")}>{sejour.arrivee}</span>
                <span>→</span>
                <span className={cn(sejour.departAujourdhui && "font-medium text-foreground")}>{sejour.depart}</span>
              </div>
              <FicheChip sejour={sejour} />
            </>
          ) : sejour && statut === "bloque" ? (
            <div className="text-xs text-muted-foreground">
              {sejour.arrivee} → {sejour.depart}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BedDouble className="h-3.5 w-3.5" />
              {prochaineArrivee
                ? `Prochaine arrivée : ${prochaineArrivee.date} — ${prochaineArrivee.guestName}`
                : "Aucune arrivée prévue prochainement"}
            </div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {reservationId ? (
            <CopyLinkButton
              path={`/securite/villa/${reservationId}`}
              label="Copier le lien sécurité de ce séjour"
              successMessage={`Lien du séjour copié — ${nom}, uniquement ces voyageurs.`}
              iconOnly
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={basculer}
            aria-expanded={ouvert}
            aria-label={ouvert ? "Masquer les pièces d'identité" : "Voir les pièces d'identité"}
            title={ouvert ? "Masquer" : "Voir les pièces d'identité"}
          >
            {chargement ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className={cn("h-4 w-4 transition-transform", ouvert && "rotate-180")} />
            )}
          </Button>
        </div>
      </div>

      {ouvert && detail !== undefined ? (
        <div className="space-y-3 border-t bg-muted/20 p-3 sm:p-4">
          {detail === null ? (
            <p className="text-sm text-muted-foreground">Aucune information de sécurité pour ce logement.</p>
          ) : (
            <>
              {!reservationId ? (
                <p className="text-xs text-muted-foreground">
                  Aucun séjour aujourd&apos;hui — dernière fiche police enregistrée pour ce logement.
                </p>
              ) : (
                <div className="flex justify-end">
                  <Link
                    href={`/securite/villa/${reservationId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Ouvrir la page sécurité du séjour (impression)
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
              <VillaSecurityBlock data={detail} showVillaHeader={false} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Envoi direct du lien du jour au gardien du domaine (numéro WhatsApp de la sécurité renseigné
// sur le domaine) — même ton que le message sécurité par réservation (darija).
export function SecuriteWhatsAppButton({
  securitePhone,
  domaineId,
  domaineNom,
}: {
  securitePhone: string;
  domaineId: string;
  domaineNom: string;
}) {
  function envoyer() {
    const lien = `${window.location.origin}/securite/domaine/${domaineId}?jour=1`;
    const message = `السلام عليكم،\n\nهذا رابط الأمن ديال ${domaineNom} — فيه الضيوف لي واصلين اليوم:\n\n${lien}\n\nشكرا`;
    window.open(toWhatsAppUrl(securitePhone, message), "_blank");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={envoyer}
      className="border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Envoyer au gardien
    </Button>
  );
}
