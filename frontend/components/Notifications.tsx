"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ChannelKey, Interaction } from "@/lib/types";
import { ChannelBadge } from "./ChannelIcon";
import { timeAgo } from "@/lib/format";

type NotifType = "message" | "mention" | "comment" | "review";

interface Notif {
  id: string;
  type: NotifType;
  channel: ChannelKey;
  who: string;
  text: string;
  received_at: string;
  href: string;
}

const SEEN_KEY = "cc_notifications_seen_at";

const TYPE_LABEL: Record<NotifType, string> = {
  message: "New message",
  mention: "Mentioned you",
  comment: "New comment",
  review: "New review",
};

function build(
  messages: Interaction[],
  comments: Interaction[],
  reviews: Interaction[]
): Notif[] {
  const out: Notif[] = [];

  messages
    .filter((i) => i.is_unanswered)
    .forEach((i) =>
      out.push({
        id: `m-${i.id}`,
        type: "message",
        channel: i.channel,
        who: i.author.display_name,
        text: i.body,
        received_at: i.received_at,
        href: `/messages?channel=${i.channel}`,
      })
    );

  comments
    .filter((i) => i.is_unanswered)
    .forEach((i) => {
      const isMention = i.kind === "mention" || i.kind === "tag";
      out.push({
        id: `c-${i.id}`,
        type: isMention ? "mention" : "comment",
        channel: i.channel,
        who: i.author.display_name,
        text: i.body,
        received_at: i.received_at,
        href: isMention ? "/mentions" : "/comments",
      });
    });

  reviews
    .filter((i) => i.is_unanswered)
    .forEach((i) =>
      out.push({
        id: `r-${i.id}`,
        type: "review",
        channel: i.channel,
        who: i.author.display_name,
        text: `${i.rating}★ — ${i.body}`,
        received_at: i.received_at,
        href: "/comments",
      })
    );

  // Newest first; negative reviews are naturally near the top by recency,
  // but push any negative sentiment ahead within the same instant.
  return out.sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );
}

export function NotificationsBell() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [messages, comments, reviews] = await Promise.all([
      api.inbox({ channel: "all", kind: "message", unanswered: true }),
      api.inbox({ channel: "all", kind: "comment", unanswered: true }),
      api.inbox({ channel: "all", kind: "review" }),
    ]);
    setNotifs(build(messages, comments, reviews));
  }, []);

  useEffect(() => {
    const stored = Number(
      typeof window !== "undefined" ? localStorage.getItem(SEEN_KEY) : 0
    );
    setSeenAt(stored || 0);
    load();
  }, [load]);

  // close on outside click / escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const unread = notifs.filter((n) => new Date(n.received_at).getTime() > seenAt).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // reopening refreshes the feed
      load();
    } else {
      markSeen();
    }
  }

  function markSeen() {
    const now = Date.now();
    localStorage.setItem(SEEN_KEY, String(now));
    setSeenAt(now);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          open
            ? "border-accent/40 bg-accent/12 text-white"
            : "border-white/[0.08] text-slate-300 hover:border-white/15 hover:text-white"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[1.15rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_#0e1420]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] animate-fade-up overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850/95 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Notifications</span>
              {unread > 0 && (
                <span className="chip bg-rose-500/14 text-rose-300">{unread} new</span>
              )}
            </div>
            {notifs.length > 0 && (
              <button
                onClick={markSeen}
                className="text-xs font-medium text-accent-soft hover:text-white"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                You&apos;re all caught up. No one is waiting.
              </div>
            ) : (
              notifs.slice(0, 20).map((n) => {
                const isUnread = new Date(n.received_at).getTime() > seenAt;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => {
                      markSeen();
                      setOpen(false);
                    }}
                    className={`flex gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                      isUnread ? "bg-accent/[0.05]" : ""
                    }`}
                  >
                    <div className="relative">
                      <ChannelBadge channel={n.channel} size={36} />
                      {isUnread && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_0_2px_#131a29]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">
                          {n.who}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {timeAgo(n.received_at)}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-accent-soft">
                        {TYPE_LABEL[n.type]}
                        {n.type === "review" ? "" : ` on ${n.channel}`}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{n.text}</p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          <Link
            href="/messages"
            onClick={() => setOpen(false)}
            className="block border-t border-white/[0.06] px-4 py-2.5 text-center text-xs font-medium text-slate-400 hover:text-white"
          >
            Go to inbox →
          </Link>
        </div>
      )}
    </div>
  );
}
