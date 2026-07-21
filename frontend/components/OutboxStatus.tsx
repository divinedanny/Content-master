"use client";

import { useEffect, useRef, useState } from "react";
import { outbox, type OutboxItem } from "@/lib/outbox";
import { channelLabel } from "@/lib/channels";
import { ChannelBadge } from "./ChannelIcon";

function useOutbox() {
  const [, tick] = useState(0);
  useEffect(() => {
    outbox.start();
    const unsub = outbox.subscribe(() => tick((n) => n + 1));
    const onNet = () => tick((n) => n + 1);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      unsub();
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, []);
}

export function ConnectionBanner() {
  useOutbox();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(outbox.isOnline());
  });
  if (online) return null;
  const pending = outbox.pendingCount();
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.10] px-4 py-2 text-xs font-medium text-amber-200">
      <span className="h-1.5 w-1.5 animate-pulseglow rounded-full bg-amber-400" />
      You&apos;re offline — {pending > 0 ? `${pending} message${pending > 1 ? "s" : ""} saved and will send` : "messages will send"} automatically when you reconnect.
    </div>
  );
}

export function OutboxIndicator() {
  useOutbox();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pending = outbox.pendingCount();
  const failed = outbox.failedCount();
  const online = outbox.isOnline();

  // Nothing to show when idle and online.
  if (pending === 0 && failed === 0 && online) return null;

  const items = outbox.getAll().filter((i) => i.status !== "sent");

  const tone = failed > 0 ? "rose" : !online ? "amber" : "accent";
  const toneCls: Record<string, string> = {
    rose: "border-rose-500/40 bg-rose-500/12 text-rose-200",
    amber: "border-amber-500/40 bg-amber-500/12 text-amber-200",
    accent: "border-accent/40 bg-accent/12 text-accent-soft",
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${toneCls[tone]}`}
        title="Outbox"
      >
        <OutboxIcon />
        <span className="hidden sm:inline">
          {failed > 0
            ? `${failed} failed`
            : !online
            ? "Offline"
            : `Sending ${pending}`}
        </span>
        {(pending > 0 || failed > 0) && (
          <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold">
            {pending + failed}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] animate-fade-up overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850/95 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="font-semibold text-white">Outbox</span>
            <span className="text-[11px] text-slate-500">
              {online ? "Connected" : "Offline"} · {pending} queued{failed ? ` · ${failed} failed` : ""}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Outbox is empty.</div>
            ) : (
              items.map((i) => <OutboxRow key={i.client_id} item={i} />)
            )}
          </div>
          {failed > 0 && (
            <button
              onClick={() => items.filter((i) => i.status === "failed").forEach((i) => outbox.retry(i.client_id))}
              className="block w-full border-t border-white/[0.06] px-4 py-2.5 text-center text-xs font-semibold text-accent-soft hover:text-white"
            >
              Retry all failed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OutboxRow({ item }: { item: OutboxItem }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <ChannelBadge channel={item.channel} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-200">
            {item.recipient_display_name || item.recipient_handle || channelLabel(item.channel)}
          </span>
          <StatusChip item={item} />
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">{item.body}</p>
        {item.status === "failed" && (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="truncate text-rose-300">{item.last_error || "Delivery failed"}</span>
            <button onClick={() => outbox.retry(item.client_id)} className="shrink-0 font-medium text-accent-soft hover:text-white">
              Retry
            </button>
            <button onClick={() => outbox.discard(item.client_id)} className="shrink-0 text-slate-500 hover:text-white">
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ item }: { item: OutboxItem }) {
  const map: Record<string, string> = {
    queued: "bg-amber-500/14 text-amber-300",
    sending: "bg-accent/16 text-accent-soft",
    sent: "bg-emerald-500/14 text-emerald-300",
    failed: "bg-rose-500/14 text-rose-300",
  };
  const label: Record<string, string> = {
    queued: outbox.isOnline() ? "Queued" : "Offline",
    sending: "Sending",
    sent: "Sent",
    failed: "Failed",
  };
  return <span className={`chip py-0.5 text-[10px] ${map[item.status]}`}>{label[item.status]}</span>;
}

function OutboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 6h14l3 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4l3-6Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
