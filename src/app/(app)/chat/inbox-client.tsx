"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CanalDot } from "@/components/app/canal-badge";
import { Beds24ReplyForm } from "@/components/app/beds24-reply-form";
import { SOURCE_META } from "@/lib/canal";
import { traduireMessagesRecus } from "@/lib/actions/traduction";
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
  messages: InboxMessage[];
  phone: string | null;
  reservationId: string | null; // seulement pour Airbnb (réponse via Beds24)
  beds24InquiryId?: number | null; // demande d'information Airbnb, sans réservation dans l'app
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

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? conversations[0]?.key ?? null);

  const awaitingCount = conversations.filter((c) => c.awaitingReply).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tab === "a_repondre" && !c.awaitingReply) return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.logement ?? "").toLowerCase().includes(q);
    });
  }, [conversations, query, tab, channelFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selected = conversations.find((c) => c.key === selectedKey) ?? null;

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
    <div className="flex h-[calc(100vh-19rem)] min-h-[32rem] overflow-hidden rounded-xl border border-border bg-card">
      {/* Liste */}
      <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-medium">
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
                setPage(0);
              }}
              placeholder="Rechercher un voyageur, un logement..."
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    setPage(0);
                  }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
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
                setPage(0);
              }}
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
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
                onClick={() => setSelectedKey(c.key)}
                className={cn(
                  "flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors",
                  c.key === selectedKey ? "bg-accent" : "hover:bg-muted/60"
                )}
              >
                <Avatar name={c.name} channel={c.channel} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[c.status])}>
                      {c.statusLabel}
                    </span>
                    <span className={cn("shrink-0 text-xs", c.awaitingReply ? "font-semibold" : "text-muted-foreground")}>
                      {formatTime(c.lastAt)}
                      {c.awaitingReply ? <span className="ml-1 text-destructive">•</span> : null}
                    </span>
                  </div>
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.stay || c.logement ? [c.stay, c.logement].filter(Boolean).join(" · ") : c.preview}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border p-3 text-sm">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-lg border border-input px-3 py-1.5 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-muted-foreground">
            Page {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-lg border border-input px-3 py-1.5 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
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

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {selected.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun message dans cette conversation.</p>
              ) : (
                selected.messages.map((m, i) => (
                  <div key={i} className={cn("flex", m.fromContact ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
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
