"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PendingOutbound, ThreadResponse } from "@/lib/types";
import { channelColor } from "@/lib/channels";
import { outbox, type OutboxItem } from "@/lib/outbox";
import { ChannelBadge } from "./ChannelIcon";
import {
  ConfidenceMeter,
  EscalationFlag,
  SentimentBadge,
  Spinner,
  StarRating,
} from "./ui";
import { clockTime } from "@/lib/format";

type Bubble = {
  key: string;
  outbound: boolean;
  body: string;
  time: string;
  status: "sent" | "queued" | "sending" | "failed";
  client_id?: string;
  error?: string;
};

export function Conversation({
  interactionId,
  onResolved,
  onBack,
}: {
  interactionId: number;
  onResolved: () => void;
  onBack?: () => void;
}) {
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [, forceTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenSent = useRef<Set<string>>(new Set());

  const reload = useCallback(() => {
    // Keep the current thread on screen if a refresh races an offline network.
    return api.thread(interactionId).then(setData).catch(() => {});
  }, [interactionId]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  // Live refresh: poll the open thread so new inbound/outbound messages appear
  // without a manual reload. Silent — reload() keeps the current thread on
  // screen and never clears the composer (its text is separate state).
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      reload();
    }, 8000);
    return () => clearInterval(id);
  }, [reload]);

  // Re-render on outbox changes, and reload the thread when one of this
  // thread's messages transitions to sent (so the server bubble replaces the
  // optimistic one instead of vanishing when it's pruned).
  useEffect(() => {
    return outbox.subscribe(() => {
      forceTick((n) => n + 1);
      const threadId = data?.interaction.thread_id;
      if (!threadId) return;
      const justSent = outbox
        .getAll()
        .filter((i) => i.thread_id === threadId && i.status === "sent" && !seenSent.current.has(i.client_id));
      if (justSent.length) {
        justSent.forEach((i) => seenSent.current.add(i.client_id));
        reload();
        onResolved();
      }
    });
  }, [data?.interaction.thread_id, reload, onResolved]);

  if (!data) return <Spinner label="Loading conversation…" />;

  const { interaction, channel } = data;
  const isMessage = interaction.kind === "message";
  const isReview = interaction.kind === "review";

  return (
    <div className="flex h-full flex-col">
      <Header interaction={interaction} onBack={onBack} />

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {isReview && interaction.rating != null && (
          <div className="flex justify-center">
            <div className="rounded-full bg-white/[0.04] px-4 py-1.5">
              <StarRating rating={interaction.rating} />
            </div>
          </div>
        )}
        <Bubbles data={data} />
      </div>

      {/* Footer: DMs get a real composer; comments/reviews keep the AI gate. */}
      {isMessage ? (
        !channel.supports_dm ? (
          <PolicyWall label={channel.label} note={channel.constraint_note} />
        ) : (
          <DmComposer data={data} onSent={() => onResolved()} afterReload={reload} />
        )
      ) : (
        <ApprovalGate data={data} interactionId={interactionId} onResolved={onResolved} reload={reload} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({
  interaction,
  onBack,
}: {
  interaction: ThreadResponse["interaction"];
  onBack?: () => void;
}) {
  const color = channelColor(interaction.channel);
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
        style={{ background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
      >
        {interaction.author.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-white">{interaction.author.display_name}</span>
          <ChannelBadge channel={interaction.channel} size={20} />
        </div>
        <div className="truncate text-xs text-slate-500">
          @{interaction.author.handle} · {interaction.channel_label}
        </div>
      </div>
      <div className="hidden sm:block">
        <SentimentBadge sentiment={interaction.sentiment} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- bubbles */

function Bubbles({ data }: { data: ThreadResponse }) {
  const threadId = data.interaction.thread_id;

  // Server-confirmed messages.
  const serverBubbles: Bubble[] = data.messages.map((m) => ({
    key: `m-${m.id}`,
    outbound: m.is_outbound === true || (m.status === "sent" && m.author.handle === "you"),
    body: m.body,
    time: clockTime(m.received_at),
    status: "sent",
  }));

  // Pending (queued/sending/failed) — merge server queue with the client
  // outbox, keyed by client_id so we never show a duplicate.
  const byClient = new Map<string, Bubble>();
  data.pending
    .filter((p) => p.status !== "sent")
    .forEach((p: PendingOutbound) =>
      byClient.set(p.client_id, {
        key: `p-${p.client_id}`,
        outbound: true,
        body: p.body,
        time: clockTime(p.created_at),
        status: (p.status === "cancelled" ? "failed" : p.status) as Bubble["status"],
        client_id: p.client_id,
        error: p.last_error,
      })
    );
  outbox.forThread(threadId).forEach((i: OutboxItem) =>
    byClient.set(i.client_id, {
      key: `o-${i.client_id}`,
      outbound: true,
      body: i.body,
      time: clockTime(i.created_at),
      status: i.status === "sent" ? "sent" : i.status,
      client_id: i.client_id,
      error: i.last_error,
    })
  );
  const pendingBubbles = [...byClient.values()].filter((b) => b.status !== "sent");

  const all = [...serverBubbles, ...pendingBubbles];

  return (
    <>
      {all.map((b) => (
        <div key={b.key} className={`flex ${b.outbound ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              b.outbound
                ? "rounded-br-md bg-accent/90 text-[#fff]"
                : "rounded-bl-md bg-white/[0.06] text-slate-100"
            } ${b.status === "failed" ? "ring-1 ring-rose-400/50" : ""}`}
          >
            <p className="whitespace-pre-wrap">{b.body}</p>
            <div className={`mt-1 flex items-center gap-1.5 text-[10px] ${b.outbound ? "text-white/70" : "text-slate-500"}`}>
              <span>{b.time}</span>
              {b.outbound && <DeliveryTick status={b.status} clientId={b.client_id} error={b.error} />}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function DeliveryTick({
  status,
  clientId,
  error,
}: {
  status: Bubble["status"];
  clientId?: string;
  error?: string;
}) {
  if (status === "sent")
    return <span className="text-white/80" title="Sent natively">· sent ✓✓</span>;
  if (status === "sending") return <span>· sending…</span>;
  if (status === "queued")
    return (
      <span title="Waiting for network — will send automatically">
        · {outbox.isOnline() ? "queued ⏱" : "offline — queued ⏱"}
      </span>
    );
  // failed
  return (
    <span className="text-rose-200">
      · failed
      {clientId && (
        <button
          onClick={() => outbox.retry(clientId)}
          className="ml-1 underline hover:text-white"
          title={error}
        >
          retry
        </button>
      )}
    </span>
  );
}

/* --------------------------------------------------------------- composer */

function DmComposer({
  data,
  onSent,
  afterReload,
}: {
  data: ThreadResponse;
  onSent: () => void;
  afterReload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const draft = data.interaction.draft;
  const online = outbox.isOnline();

  function send() {
    const body = text.trim();
    if (!body) return;
    outbox.send({
      channel: data.channel.channel,
      body,
      thread_id: data.interaction.thread_id,
      interaction_id: data.interaction.id,
      used_ai_draft: !!draft && body === draft.text,
    });
    setText("");
    onSent();
    // Give the online round-trip a moment, then refresh from the server.
    setTimeout(() => void afterReload(), 1100);
  }

  return (
    <div className="border-t border-white/[0.06] bg-ink-900/60 p-3 sm:p-4">
      {draft && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            onClick={() => setText(draft.text)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-medium text-accent-soft transition hover:bg-accent/20"
          >
            <SparkIcon /> Use AI suggestion
          </button>
          <div className="flex items-center gap-2">
            {draft.requires_escalation && <EscalationFlag />}
            <ConfidenceMeter value={draft.confidence} />
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
          rows={2}
          placeholder={`Message ${data.interaction.author.display_name}…`}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-white/10 bg-field p-3 text-sm text-slate-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-[#fff] shadow-glow transition hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
          <SendIcon />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <NativeIcon />
          Sends natively into {data.interaction.author.display_name}&apos;s {data.channel.label} thread
        </span>
        {!online && <span className="text-amber-300">Offline — will send when you reconnect</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- AI approval gate (comments/reviews) */

function ApprovalGate({
  data,
  interactionId,
  onResolved,
  reload,
}: {
  data: ThreadResponse;
  interactionId: number;
  onResolved: () => void;
  reload: () => Promise<void>;
}) {
  const { interaction, channel, send_policy } = data;
  const [text, setText] = useState(interaction.draft?.text ?? "");
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const alreadyHandled = interaction.status === "sent" || interaction.status === "dismissed";

  useEffect(() => {
    setText(interaction.draft?.text ?? "");
    setEdited(false);
    setResult(null);
    setError(null);
  }, [interaction.id, interaction.draft?.text]);

  async function act(decision: "approve" | "reject") {
    setSending(true);
    setError(null);
    const res = await api.approve(interactionId, edited && decision === "approve" ? "edit" : decision, decision === "reject" ? undefined : text);
    setSending(false);
    if (res.__status && res.__status >= 400) {
      setError(res.error || "Send was blocked by platform policy.");
      return;
    }
    setResult(decision === "reject" ? "dismissed" : res.sent_natively_to || channel.label);
    onResolved();
    reload();
  }

  if (result) {
    const dismissed = result === "dismissed";
    return (
      <div className="border-t border-white/[0.06] bg-ink-900/60 p-4 sm:p-5">
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm ${dismissed ? "bg-slate-500/10 text-slate-300" : "bg-emerald-500/12 text-emerald-200"}`}>
          <span className="text-lg">{dismissed ? "🗂️" : "✅"}</span>
          {dismissed ? "Dismissed — removed from the backlog." : <span><span className="font-semibold text-white">Posted</span> to {result}.</span>}
        </div>
      </div>
    );
  }

  if (alreadyHandled) {
    return (
      <div className="border-t border-white/[0.06] bg-ink-900/60 p-4">
        <div className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
          This {interaction.kind} is already {interaction.status}.
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.06] bg-ink-900/60 p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-soft">
          <SparkIcon /> AI-drafted response · human approval required
        </div>
        <div className="flex items-center gap-2">
          {interaction.draft?.requires_escalation && <EscalationFlag />}
          {interaction.draft && <ConfidenceMeter value={interaction.draft.confidence} />}
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(e.target.value !== (interaction.draft?.text ?? ""));
        }}
        rows={4}
        placeholder="Write a response…"
        className="w-full resize-none rounded-xl border border-white/10 bg-field p-3.5 text-sm text-slate-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      />
      {!send_policy.allowed && (
        <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 text-xs text-amber-200">
          {send_policy.reason}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-xs text-rose-200">
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={() => act("reject")}
          disabled={sending}
          className="rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={() => act("approve")}
          disabled={sending || !send_policy.allowed || !text.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#fff] shadow-[0_6px_20px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Posting…" : edited ? "Approve edit & post" : "Approve & post"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function PolicyWall({ label, note }: { label: string; note: string }) {
  return (
    <div className="border-t border-white/[0.06] bg-ink-900/60 p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <LockIcon /> No direct messaging on {label}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{note}</p>
        <p className="mt-2 text-xs text-slate-500">
          We show the truth about platform limits rather than a fake inbox. Comments and mentions are
          available in their own sections.
        </p>
      </div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.9">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NativeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
