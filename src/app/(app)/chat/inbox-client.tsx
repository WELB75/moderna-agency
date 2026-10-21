"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { CanalDot } from "@/components/app/canal-badge";
import { Beds24ReplyForm } from "@/components/app/beds24-reply-form";
import { WhatsAppAgenceReplyForm } from "@/components/app/whatsapp-agence-reply-form";
import { SOURCE_META } from "@/lib/canal";
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

const STATUS_CLASS: Record<InboxStatus, string> = {
  en_cours: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  a_venir: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  termine: "bg-emerald-500/10 text-emerald-700/80 dark:text-emerald-400/80",
  autre: "bg-muted text-muted-foreground",
};

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, channel, size = "md" }: { name: string; channel: InboxChannel; size?: "md" | "lg" }) {
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/15 font-medium text-primary",
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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
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
  const [tab, setTab] = useState<"tous" | "a_repondre">("tous");
  const [channelFilter, setChannelFilter] = useState<InboxChannel | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? conversations[0]?.key ?? null);

  const awaitingCount = conversations.filter((c) => c.awaitingReply).length;

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
      if (tab === "a_repondre" && !c.awaitingReply) return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.logement ?? "").toLowerCase().includes(q);
    });
  }, [conversations, query, tab, channelFilter]);

  const visible = filtered;
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

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[24rem] overflow-hidden rounded-xl border border-border bg-card md:h-[calc(100vh-9.5rem)] md:min-h-[32rem]">
      {/* Liste */}
      <div className={cn("w-full shrink-0 flex-col border-r border-border md:flex md:w-[24rem] lg:w-[28rem]", mobileOuvert ? "hidden" : "flex")}>
        <div className="space-y-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-medium">
              {nonLusCount > 0 ? `${nonLusCount} non lu${nonLusCount > 1 ? "s" : ""} · ` : ""}
              {awaitingCount === 0 ? "Rien à répondre" : `${awaitingCount} à répondre`}
            </p>
            {notice ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{notice}</p> : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Rechercher un voyageur, un logement..."
              className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base outline-none md:h-10 md:text-sm focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-lg bg-muted p-1 text-sm">
              {(
                [
                  ["tous", "Tous"],
                  ["a_repondre", `À répondre${awaitingCount ? ` ${awaitingCount}` : ""}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTab(value);
                  }}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors",
                    tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value as InboxChannel | "all");
              }}
              className="h-11 rounded-lg border border-input bg-background px-2 text-base md:h-10 md:text-sm"
              aria-label="Filtrer par canal"
            >
              <option value="all">Tous canaux</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="airbnb">Airbnb</option>
              <option value="booking">Booking.com</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucune conversation.</p>
          ) : (
            visible.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setSelectedKey(c.key);
                  setMobileOuvert(true);
                }}
                className={cn(
                  "flex w-full gap-3 border-b border-border px-4 py-3.5 text-left transition-colors md:py-3",
                  c.key === selectedKey ? "bg-accent" : "hover:bg-muted/60"
                )}
              >
                <Avatar name={c.name} channel={c.channel} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[c.status])}>
                      {c.statusLabel}
                    </span>
                    <span className={cn("shrink-0 text-xs", estNonLue(c) ? "font-semibold" : "text-muted-foreground")}>
                      {formatTime(c.lastAt)}
                      {estNonLue(c) ? <span className="ml-1 text-destructive">•</span> : null}
                    </span>
                  </div>
                  <p className={cn("truncate", estNonLue(c) ? "font-bold" : "font-semibold")}>{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.stay || c.logement ? [c.stay, c.logement].filter(Boolean).join(" · ") : c.preview}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={cn("min-w-0 flex-1 flex-col md:flex", mobileOuvert ? "flex" : "hidden")}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-2 py-3 md:gap-3 md:px-5">
              <button
                type="button"
                onClick={() => setMobileOuvert(false)}
                aria-label="Retour à la liste des conversations"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-muted md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar name={selected.name} channel={selected.channel} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{selected.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {SOURCE_META[selected.channel].label}
                  {selected.stay ? ` · ${selected.stay}` : ""}
                  {selected.logement ? ` · ${selected.logement}` : ""}
                  {selected.phone ? ` · ${selected.phone}` : ""}
                </p>
              </div>
            </div>

            <div ref={filMessagesRef} className="flex-1 space-y-3 overflow-y-auto p-3 md:p-5">
              {selected.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun message dans cette conversation.</p>
              ) : (
                selected.messages.map((m, i) => (
                  <div key={i} className={cn("flex", m.fromContact ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm md:max-w-[75%] md:px-4",
                        m.fromContact ? "bg-muted text-foreground" : "bg-primary text-primary-foreground",
                        m.tool && "text-xs italic opacity-80"
                      )}
                    >
                      <MessageTexte text={m.text} />
                      {m.fromContact && !m.tool && traductions[texteATraduire(m.text)] && !traductions[texteATraduire(m.text)].estFrancais ? (
                        <div className="mt-2 border-t border-foreground/10 pt-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Traduction · {traductions[texteATraduire(m.text)].langue}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{traductions[texteATraduire(m.text)].fr}</p>
                        </div>
                      ) : null}
                      {m.at ? (
                        <p className={cn("mt-1 text-[10px]", m.fromContact ? "text-muted-foreground" : "text-primary-foreground/70")}>
                          {formatTime(m.at)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            {traductionEnCours ? (
              <p className="border-t border-border px-5 py-1.5 text-xs text-muted-foreground">Traduction en cours...</p>
            ) : traductionErreur ? (
              <p className="border-t border-border px-5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                Traduction indisponible pour le moment.
              </p>
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
              <p className="border-t border-border p-3 text-sm text-muted-foreground">
                Réponse WhatsApp depuis l&apos;app : pas encore branchée, la conversation est en lecture seule.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Sélectionne une conversation.
          </div>
        )}
      </div>
    </div>
  );
}
