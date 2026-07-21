"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ChannelInfo, Interaction } from "@/lib/types";
import type { ChannelKey } from "@/lib/types";
import { TabStrip, type TabKey } from "./TabStrip";
import { InboxList } from "./InboxList";
import { Conversation } from "./Conversation";
import { EmptyState, Spinner } from "./ui";

export interface WorkspaceQuery {
  channel: string;
  kind: "message" | "comment" | "review";
  unanswered?: boolean;
}

export interface EmptyDescriptor {
  title: string;
  hint?: string;
  honest?: boolean;
}

export function InboxWorkspace({
  channels,
  resolveQuery,
  initialTab = "all",
  emptyTitle = "Nothing here",
  emptyHint,
  negativeFirst = false,
  suppressCountFor = [],
  describeEmpty,
  clientFilter,
  countLoader,
}: {
  // channel tab keys to show (order from CHANNELS)
  channels: ChannelKey[];
  resolveQuery: (tab: TabKey) => WorkspaceQuery;
  initialTab?: TabKey;
  emptyTitle?: string;
  emptyHint?: string;
  negativeFirst?: boolean;
  // channels whose tab count badge should be hidden (e.g. LinkedIn under Messages)
  suppressCountFor?: ChannelKey[];
  // override the empty state per tab (used for the honest LinkedIn no-DM wall)
  describeEmpty?: (tab: TabKey, info?: ChannelInfo) => EmptyDescriptor | null;
  // narrow the fetched list client-side (e.g. mentions-only vs comments-only)
  clientFilter?: (i: Interaction) => boolean;
  // custom per-tab unanswered counts; falls back to channels() when omitted
  countLoader?: () => Promise<Partial<Record<TabKey, number>>>;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [channelInfo, setChannelInfo] = useState<ChannelInfo[]>([]);
  const [showConvoMobile, setShowConvoMobile] = useState(false);

  // channel metadata (for the honest no-DM wall) is always needed
  useEffect(() => {
    api.channels().then(setChannelInfo);
  }, []);

  // unanswered counts for tab badges
  const refreshCounts = useCallback(() => {
    if (countLoader) {
      countLoader().then(setCounts).catch(() => {});
      return;
    }
    api.channels().then((chs: ChannelInfo[]) => {
      const c: Partial<Record<TabKey, number>> = {};
      let all = 0;
      chs.forEach((ch) => {
        if (channels.includes(ch.channel)) {
          c[ch.channel] = suppressCountFor.includes(ch.channel) ? 0 : ch.unanswered;
          if (!suppressCountFor.includes(ch.channel)) all += ch.unanswered;
        }
      });
      c.all = all;
      setCounts(c);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const load = useCallback(
    (opts: { silent?: boolean } = {}) => {
      const q = resolveQuery(tab);
      // Only blank the list on a first/tab load — a silent refresh keeps the
      // current view (and the open conversation) intact, which matters when a
      // refresh races an offline network.
      if (!opts.silent) setItems(null);
      api
        .inbox(q)
        .then((data) => {
          const filtered = clientFilter ? data.filter(clientFilter) : data;
          const sorted = negativeFirst
            ? [...filtered].sort((a, b) => {
                const rank = (s: string) => (s === "negative" ? 0 : s === "neutral" ? 1 : 2);
                return rank(a.sentiment) - rank(b.sentiment);
              })
            : filtered;
          setItems(sorted);
          setSelectedId((prev) =>
            prev && sorted.some((i) => i.id === prev) ? prev : sorted[0]?.id ?? null
          );
        })
        .catch(() => {
          /* offline / transient — keep whatever is on screen */
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, negativeFirst]
  );

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => items?.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  function handleSelect(id: number) {
    setSelectedId(id);
    setShowConvoMobile(true);
  }

  const activeInfo =
    tab === "all" ? undefined : channelInfo.find((c) => c.channel === tab);
  const emptyDesc: EmptyDescriptor =
    (describeEmpty && describeEmpty(tab, activeInfo)) ?? {
      title: emptyTitle,
      hint: emptyHint,
    };

  return (
    <div className="space-y-4">
      <TabStrip
        active={tab}
        onChange={(t) => {
          setTab(t);
          setShowConvoMobile(false);
        }}
        channels={channels}
        counts={counts}
      />

      {/* Honest platform-wall banner (e.g. LinkedIn has no commercial DM API) */}
      {items !== null && items.length === 0 && emptyDesc.honest && (
        <HonestWall title={emptyDesc.title} note={emptyDesc.hint} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* list */}
        <div className={`panel overflow-hidden ${showConvoMobile ? "hidden lg:block" : ""}`}>
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            {items === null ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState title={emptyDesc.title} hint={emptyDesc.hint} />
            ) : (
              <InboxList items={items} selectedId={selectedId} onSelect={handleSelect} />
            )}
          </div>
        </div>

        {/* conversation */}
        <div
          className={`panel h-[calc(100vh-16rem)] overflow-hidden ${
            showConvoMobile ? "" : "hidden lg:block"
          }`}
        >
          {selected ? (
            <Conversation
              key={selected.id}
              interactionId={selected.id}
              onResolved={() => {
                load({ silent: true });
                refreshCounts();
              }}
              onBack={() => setShowConvoMobile(false)}
            />
          ) : (
            <EmptyState
              title="Select a conversation"
              hint="Pick a customer from the list to see the thread and the AI-drafted reply."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HonestWall({ title, note }: { title: string; note?: string }) {
  return (
    <div className="animate-fade-up rounded-2xl border border-linkedin/25 bg-gradient-to-r from-linkedin/[0.10] to-transparent p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linkedin/15 text-linkedin">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-white">{title}</div>
          {note && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{note}</p>}
          <p className="mt-2 text-xs text-slate-500">
            We tell the truth about platform limits instead of showing a fake inbox. LinkedIn
            comments and @mentions are available under <span className="text-slate-300">Comments</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
