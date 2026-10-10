"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PlatformIcon, WhatsAppIcon, type PlatformKey } from "@/components/app/platform-badge";
import { Beds24ReplyForm } from "@/components/app/beds24-reply-form";
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
  reservationId: string | null; // seulement pour Airbnb/Booking (réponse via Beds24)
};

const CHANNEL_META: Record<InboxChannel, { label: string; color: string }> = {
  airbnb: { label: "Airbnb", color: "#FF5A5F" },
  booking: { label: "Booking.com", color: "#003A9A" },
  direct: { label: "En direct", color: "#6b7280" },
  whatsapp: { label: "WhatsApp", color: "#25D366" },
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

function ChannelDot({ channel, className }: { channel: InboxChannel; className?: string }) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={cn("flex items-center justify-center rounded-full border-2 border-card text-white", className)}
      style={{ backgroundColor: meta.color }}
      title={meta.label}
    >
      {channel === "whatsapp" ? (
        <WhatsAppIcon className="h-2.5 w-2.5" />
      ) : (
        <PlatformIcon platform={channel as PlatformKey} className="h-2.5 w-2.5" />
      )}
    </span>
  );
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
      <ChannelDot channel={channel} className="absolute -bottom-0.5 -right-0.5 h-5 w-5" />
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

const PAGE_SIZE = 20;

export function InboxClient({
  conversations,
  initialKey,
}: {
  conversations: InboxConversation[];
  initialKey: string | null;
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

  return (
    <div className="flex h-[calc(100vh-19rem)] min-h-[32rem] overflow-hidden rounded-xl border border-border bg-card">
      {/* Liste */}
      <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-medium">
              {awaitingCount === 0 ? "Rien à répondre" : `${awaitingCount} à répondre`}
            </p>
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
              <option value="booking">Booking.com</option>
              <option value="direct">En direct</option>
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
                  {CHANNEL_META[selected.channel].label}
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
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
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

            {selected.reservationId ? (
              <Beds24ReplyForm reservationId={selected.reservationId} />
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
