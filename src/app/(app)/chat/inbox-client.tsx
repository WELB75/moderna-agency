"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Inbox, MessageCircle, Search, X } from "lucide-react";
import { CanalDot } from "@/components/app/canal-badge";
import { Beds24ReplyForm } from "@/components/app/beds24-reply-form";
import { WhatsAppAgenceReplyForm } from "@/components/app/whatsapp-agence-reply-form";
import { SOURCE_META } from "@/lib/canal";
import { toWhatsAppUrl } from "@/lib/phone";
import { traduireMessagesRecus } from "@/lib/actions/traduction";
import { marquerConversationLue } from "@/lib/actions/messages-lus";
import { useEstMobile } from "@/lib/use-est-mobile";
import type { TraductionRecue } from "@/lib/translate-ai";
import { cn } from "@/lib/utils";

export type InboxChannel = "airbnb" | "booking" | "direct" | "whatsapp";
export type InboxStatus = "en_cours" | "a_venir" | "termine" | "autre";

export type InboxMessage = { fromContact: boolean; text: string; tool?: boolean; at: string | null };

export type InboxConversation = {
  key: string;
  name: string;
  channel: InboxChannel;
  status: InboxStatus;
  statusLabel: string;
  stay: string | null; // "10 → 13 oct."
  logement: string | null;
  lastAt: string; // ISO
  preview: string;
  awaitingReply: boolean;
  unread?: boolean; // le voyageur a écrit en dernier et la conversation n'a pas encore été ouverte
  messages: InboxMessage[];
  phone: string | null;
  reservationId: string | null; // seulement pour Airbnb (réponse via Beds24)
  beds24InquiryId?: number | null; // demande d'information Airbnb, sans réservation dans l'app
  // Conversation de la ligne WhatsApp Business de l'agence : réponse possible depuis l'app tant
  // que la fenêtre de 24 h après le dernier message du client est ouverte.
  ligneAgence?: { fenetreOuverte: boolean };
};

// Boîte de réception (refonte 2026-10-22, dans la continuité du tableau de bord épuré) : liste à
// gauche, fil à droite, pleine hauteur de l'écran. Une seule colonne à la fois sur téléphone.
// Même contrat de données qu'avant (messages-boite-reception.tsx inchangé).

// Point de statut du séjour : un repère discret plutôt qu'une pastille de couleur au-dessus du nom.
const STATUS_DOT: Record<InboxStatus, string> = {
  en_cours: "bg-emerald-500",
  a_venir: "bg-amber-500",
  termine: "bg-muted-foreground/40",
  autre: "bg-muted-foreground/40",
};

const CHANNEL_FILTERS: { value: InboxChannel | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking.com" },
];

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, channel, size = "md" }: { name: string; channel: InboxChannel; size?: "md" | "lg" }) {
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
          size === "lg" ? "h-11 w-11 text-base" : "h-10 w-10 text-sm"
        )}
      >
        {initials(name)}
      </div>
      {/* Pastille de canal partagée avec le calendrier (components/app/canal-badge.tsx). */}
      <CanalDot source={channel} size="sm" className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card" />
    </div>
  );
}

function estAujourdhui(d: Date, now: Date) {
  return d.toDateString() === now.toDateString();
}

// Heure si c'est aujourd'hui, "hier", sinon jour + mois court.
function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (estAujourdhui(d, now)) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);
  if (estAujourdhui(d, hier)) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Séparateur de jour dans le fil : "Aujourd'hui", "Hier", sinon "mercredi 22 octobre".
function libelleJour(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (estAujourdhui(d, now)) return "Aujourd'hui";
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);
  if (estAujourdhui(d, hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Les messages Airbnb contiennent parfois du HTML brut (pièces jointes : <a href="...">). On
// affiche un vrai lien plutôt que le code, et on retire les autres balises.
type Morceau = { type: "texte"; valeur: string } | { type: "lien"; href: string; label: string };

function decouperLiens(brut: string): Morceau[] {
  const morceaux: Morceau[] = [];
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>(?:([\s\S]*?)<\/a>)?/gi;
  let dernier = 0;
  let m: RegExpExecArray | null;
  const nettoyer = (t: string) => t.replace(/<[^>]+>/g, "");
  while ((m = re.exec(brut))) {
    if (m.index > dernier) morceaux.push({ type: "texte", valeur: nettoyer(brut.slice(dernier, m.index)) });
    const href = m[1].replace(/&amp;/g, "&");
    const label = nettoyer(m[2] ?? "").trim();
    const estImage = /muscache|\.(png|jpe?g|webp|gif)(\?|$)/i.test(href);
    morceaux.push({ type: "lien", href, label: label && label.length < 60 ? label : estImage ? "Voir la photo" : "Ouvrir le lien" });
    dernier = re.lastIndex;
  }
  if (dernier < brut.length) morceaux.push({ type: "texte", valeur: nettoyer(brut.slice(dernier)) });
  return morceaux.filter((x) => x.type === "lien" || x.valeur.trim() !== "");
}

// Texte soumis à la traduction : sans les liens/HTML.
function texteATraduire(brut: string): string {
  return decouperLiens(brut)
    .filter((x): x is Extract<Morceau, { type: "texte" }> => x.type === "texte")
    .map((x) => x.valeur.trim())
    .join("\n")
    .trim();
}

// Aperçu d'une ligne de la liste : sans HTML ni retours à la ligne.
function apercu(brut: string): string {
  return texteATraduire(brut).replace(/\s+/g, " ").trim() || (brut.includes("<a") ? "Pièce jointe" : "");
}

function MessageTexte({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {decouperLiens(text).map((x, i) =>
        x.type === "lien" ? (
          <a key={i} href={x.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {x.label}
          </a>
        ) : (
          <span key={i}>{x.valeur}</span>
        )
      )}
    </p>
  );
}

// Bouton rond d'action dans l'en-tête du fil (WhatsApp, réservation).
function ActionIcone({
  href,
  title,
  children,
  externe = false,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  externe?: boolean;
}) {
  const classes =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground";
  return externe ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title} className={classes}>
      {children}
    </a>
  ) : (
    <Link href={href} title={title} aria-label={title} className={classes}>
      {children}
    </Link>
  );
}

export function InboxClient({
  conversations,
  initialKey,
  notice = null,
}: {
  conversations: InboxConversation[];
  initialKey: string | null;
  notice?: string | null; // ex. Beds24 injoignable : la boîte WhatsApp s'affiche quand même
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"tous" | "non_lus">("tous");
  const [channelFilter, setChannelFilter] = useState<InboxChannel | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? conversations[0]?.key ?? null);


  // Mobile : une seule colonne à la fois, la liste puis (au toucher) la conversation avec un bouton
  // retour. Ordinateur : liste et conversation côte à côte.
  const estMobile = useEstMobile();
  const [mobileOuvert, setMobileOuvert] = useState(Boolean(initialKey));

  // Suivi "lu" : une conversation affichée à l'écran est marquée lue (la pastille du menu
  // descend). Sur mobile, la conversation n'est "affichée" qu'une fois ouverte.
  const [lus, setLus] = useState<Set<string>>(() => new Set());
  const estNonLue = (c: InboxConversation) => Boolean(c.unread) && !lus.has(c.key);
  const nonLusCount = conversations.filter(estNonLue).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tab === "non_lus" && !estNonLue(c)) return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.logement ?? "").toLowerCase().includes(q);
    });
    // estNonLue ne dépend que de `lus` (déjà listé) : la liste suit donc les conversations ouvertes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, query, tab, channelFilter, lus]);

  const selected = conversations.find((c) => c.key === selectedKey) ?? null;

  const aLire = selected && (!estMobile || mobileOuvert) && estNonLue(selected) ? selected.key : null;
  useEffect(() => {
    if (!aLire) return;
    marquerConversationLue(aLire)
      .then(() => {
        setLus((prev) => new Set(prev).add(aLire));
        window.dispatchEvent(new Event("messages-lus"));
      })
      .catch(() => {});
  }, [aLire]);

  // Le fil s'ouvre sur le message le plus récent (en bas), comme dans une messagerie.
  const filMessagesRef = useRef<HTMLDivElement>(null);
  const filCle = selected ? `${selected.key}:${selected.messages.length}` : "";
  useEffect(() => {
    const el = filMessagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filCle, mobileOuvert]);

  // Traduction des messages des voyageurs Airbnb / Booking.com (cache par texte d'origine).
  const [traductions, setTraductions] = useState<Record<string, TraductionRecue>>({});
  const [erreurCle, setErreurCle] = useState<string | null>(null);
  const aTraduire =
    selected && (selected.channel === "airbnb" || selected.channel === "booking")
      ? selected.messages.filter((m) => m.fromContact && !m.tool).map((m) => texteATraduire(m.text)).filter((t) => t !== "")
      : [];
  const aTraduireCle = aTraduire.join("\u0001");
  const traductionErreur = erreurCle === aTraduireCle;
  const traductionEnCours = !traductionErreur && aTraduire.some((t) => !traductions[t]);
  useEffect(() => {
    const manquants = Array.from(new Set(aTraduire.filter((t) => !traductions[t])));
    if (manquants.length === 0) return;
    let annule = false;
    traduireMessagesRecus(manquants)
      .then((res) => {
        if (annule) return;
        setTraductions((prev) => {
          const next = { ...prev };
          manquants.forEach((t, i) => {
            if (res[i]) next[t] = res[i];
          });
          return next;
        });
      })
      .catch(() => {
        if (!annule) setErreurCle(aTraduireCle);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aTraduireCle]);

  // Langue de réponse : celle du dernier message du voyageur, si ce n'est pas du français.
  const derniereLangue = (() => {
    for (let i = aTraduire.length - 1; i >= 0; i--) {
      const t = traductions[aTraduire[i]];
      if (t) return t.estFrancais ? null : t.langue;
    }
    return null;
  })();

  // Fil groupé par jour (séparateurs) ; les messages sans horodatage (WhatsApp) restent dans
  // l'ordre, sans séparateur.
  const groupes = useMemo(() => {
    if (!selected) return [];
    const out: { jour: string | null; messages: InboxMessage[] }[] = [];
    for (const m of selected.messages) {
      const jour = m.at ? libelleJour(m.at) : null;
      const dernier = out[out.length - 1];
      if (dernier && dernier.jour === jour) dernier.messages.push(m);
      else out.push({ jour, messages: [m] });
    }
    return out;
  }, [selected]);

  const sousTitre = nonLusCount === 0 ? "Tout est lu" : `${nonLusCount} non lu${nonLusCount > 1 ? "s" : ""}`;

  return (
    // Pleine hauteur de la zone utile : en-tête de l'app (3.5rem) et marges de page déduits ;
    // sur téléphone, la barre du bas (pb-20 du layout) aussi.
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[26rem] overflow-hidden rounded-2xl border border-border bg-card md:h-[calc(100dvh-6.5rem)] md:min-h-[32rem]">
      {/* ---- Liste ---- */}
      <div
        className={cn(
          "w-full shrink-0 flex-col border-border md:flex md:w-[clamp(17rem,38%,24rem)] md:border-r",
          mobileOuvert ? "hidden" : "flex"
        )}
      >
        <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
            <p className={cn("text-xs", nonLusCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{sousTitre}</p>
          </div>
          {notice ? <p className="text-xs text-amber-700 dark:text-amber-400">{notice}</p> : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Voyageur, logement…"
              className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex rounded-xl bg-muted p-1 text-sm">
            {(
              [
                ["tous", "Toutes"],
                ["non_lus", "Non lus"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors",
                  tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {value === "non_lus" && nonLusCount > 0 ? (
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                      tab === value ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                    )}
                  >
                    {nonLusCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Canaux : pastilles plutôt qu'une liste déroulante — on voit d'un coup d'œil où on est. */}
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_FILTERS.map((f) => {
              const actif = channelFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setChannelFilter(f.value)}
                  title={f.label}
                  aria-label={f.label}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                    actif ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.value !== "all" ? <CanalDot source={f.value} size="xs" /> : null}
                  {f.value === "all" ? f.label : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
              <Inbox className="h-6 w-6" />
              {tab === "non_lus" ? "Aucun message non lu." : "Aucune conversation."}
            </div>
          ) : (
            <ul>
              {filtered.map((c) => {
                const nonLue = estNonLue(c);
                const active = c.key === selectedKey;
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(c.key);
                        setMobileOuvert(true);
                      }}
                      className={cn(
                        "relative flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors",
                        active ? "bg-accent/70 dark:bg-accent" : "hover:bg-muted/60"
                      )}
                    >
                      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary" aria-hidden /> : null}
                      <Avatar name={c.name} channel={c.channel} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={cn("truncate text-sm", nonLue ? "font-bold" : "font-semibold")}>{c.name}</p>
                          <span className={cn("shrink-0 text-xs tabular-nums", nonLue ? "font-semibold text-primary" : "text-muted-foreground")}>
                            {formatTime(c.lastAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className={cn("min-w-0 flex-1 truncate text-sm", nonLue ? "text-foreground" : "text-muted-foreground")}>
                            {apercu(c.preview) || "—"}
                          </p>
                          {nonLue ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Non lu" /> : null}
                        </div>
                        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[c.status])} aria-hidden />
                          <span className="truncate">
                            {c.statusLabel}
                            {c.stay ? ` · ${c.stay}` : ""}
                            {c.logement ? ` · ${c.logement}` : ""}
                          </span>
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Conversation ---- */}
      <div className={cn("min-w-0 flex-1 flex-col md:flex", mobileOuvert ? "flex" : "hidden")}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-2 py-2.5 md:gap-3 md:px-4">
              <button
                type="button"
                onClick={() => setMobileOuvert(false)}
                aria-label="Retour à la liste des conversations"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-muted md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar name={selected.name} channel={selected.channel} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{selected.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {SOURCE_META[selected.channel].label}
                  {selected.stay ? ` · ${selected.stay}` : ""}
                  {selected.logement ? ` · ${selected.logement}` : ""}
                  <span className="hidden sm:inline">{selected.phone ? ` · ${selected.phone}` : ""}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {selected.phone ? (
                  <ActionIcone href={toWhatsAppUrl(selected.phone)} title={`WhatsApp · ${selected.phone}`} externe>
                    <MessageCircle className="h-4 w-4" />
                  </ActionIcone>
                ) : null}
                {selected.reservationId ? (
                  <ActionIcone href={`/reservations/${selected.reservationId}`} title="Ouvrir la réservation">
                    <CalendarDays className="h-4 w-4" />
                  </ActionIcone>
                ) : null}
              </div>
            </div>

            <div ref={filMessagesRef} className="flex-1 overflow-y-auto bg-muted/30 px-3 py-4 md:px-6">
              {selected.messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Aucun message dans cette conversation.</p>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {groupes.map((g, gi) => (
                    <div key={gi} className="space-y-1.5">
                      {g.jour ? (
                        <div className="flex items-center gap-3 py-1">
                          <span className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-medium capitalize text-muted-foreground">{g.jour}</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                      {g.messages.map((m, i) => {
                        const t = m.fromContact && !m.tool ? traductions[texteATraduire(m.text)] : undefined;
                        return (
                          <div key={i} className={cn("flex", m.fromContact ? "justify-start" : "justify-end")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_1px_rgba(0,0,0,0.04)] md:max-w-[70%] md:px-4 md:py-2.5",
                                m.fromContact
                                  ? "rounded-bl-md border border-border bg-card text-foreground"
                                  : "rounded-br-md bg-primary text-primary-foreground",
                                m.tool && "text-xs italic opacity-80"
                              )}
                            >
                              <MessageTexte text={m.text} />
                              {t && !t.estFrancais ? (
                                <div className="mt-2 border-t border-border pt-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Traduction · {t.langue}</p>
                                  <p className="whitespace-pre-wrap break-words text-foreground/90">{t.fr}</p>
                                </div>
                              ) : null}
                              {m.at ? (
                                <p className={cn("mt-1 text-right text-[10px] tabular-nums", m.fromContact ? "text-muted-foreground" : "text-primary-foreground/70")}>
                                  {formatHeure(m.at)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {traductionEnCours ? (
              <p className="border-t border-border px-4 py-1.5 text-xs text-muted-foreground">Traduction en cours…</p>
            ) : traductionErreur ? (
              <p className="border-t border-border px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">Traduction indisponible pour le moment.</p>
            ) : null}

            {selected.reservationId || selected.beds24InquiryId ? (
              <Beds24ReplyForm
                key={selected.key}
                reservationId={selected.reservationId}
                beds24InquiryId={selected.beds24InquiryId}
                langue={derniereLangue}
              />
            ) : selected.ligneAgence && selected.phone ? (
              <WhatsAppAgenceReplyForm key={selected.key} contact={selected.phone} fenetreOuverte={selected.ligneAgence.fenetreOuverte} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                <span>Lecture seule ici : la réponse WhatsApp se fait dans WhatsApp.</span>
                {selected.phone ? (
                  <a
                    href={toWhatsAppUrl(selected.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Répondre sur WhatsApp
                  </a>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5" />
            </span>
            {conversations.length === 0 ? "Aucune conversation pour le moment." : "Choisis une conversation dans la liste."}
          </div>
        )}
      </div>
    </div>
  );
}
