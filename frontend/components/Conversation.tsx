"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ThreadResponse } from "@/lib/types";
import { channelColor } from "@/lib/channels";
import { ChannelBadge } from "./ChannelIcon";
import {
  ConfidenceMeter,
  EscalationFlag,
  SentimentBadge,
  Spinner,
  StarRating,
  StatusPill,
} from "./ui";
import { clockTime } from "@/lib/format";

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
  const [draftText, setDraftText] = useState("");
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setResult(null);
    setError(null);
    setEdited(false);
    api.thread(interactionId).then((d) => {
      setData(d);
      setDraftText(d.interaction.draft?.text ?? "");
    });
  }, [interactionId]);

  if (!data) return <Spinner label="Loading conversation…" />;

  const { interaction, messages, channel, send_policy } = data;
  const color = channelColor(interaction.channel);
  const isReview = interaction.kind === "review";
  const alreadyHandled = interaction.status === "sent" || interaction.status === "dismissed";

  async function act(decision: "approve" | "edit" | "reject") {
    setSending(true);
    setError(null);
    const text = decision === "reject" ? undefined : draftText;
    const res = await api.approve(interactionId, edited && decision === "approve" ? "edit" : decision, text);
    setSending(false);
    if (res.__status && res.__status >= 400) {
      setError(res.error || "Send was blocked by platform policy.");
      return;
    }
    if (decision === "reject") {
      setResult("dismissed");
    } else {
      setResult(res.sent_natively_to || channel.label);
    }
    onResolved();
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
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
            <span className="truncate font-semibold text-white">
              {interaction.author.display_name}
            </span>
            <ChannelBadge channel={interaction.channel} size={20} />
          </div>
          <div className="truncate text-xs text-slate-500">
            @{interaction.author.handle} · {channel.label}
          </div>
        </div>
        <div className="hidden sm:block">
          <SentimentBadge sentiment={interaction.sentiment} />
        </div>
      </div>

      {/* thread */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {isReview && interaction.rating != null && (
          <div className="flex justify-center">
            <div className="rounded-full bg-white/[0.04] px-4 py-1.5">
              <StarRating rating={interaction.rating} />
            </div>
          </div>
        )}
        {messages.map((m) => {
          const outbound = m.status === "sent" && m.author.handle === "you";
          return (
            <div
              key={m.id}
              className={`flex ${outbound ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  outbound
                    ? "rounded-br-md bg-accent/90 text-white"
                    : "rounded-bl-md bg-white/[0.06] text-slate-100"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <div className={`mt-1 text-[10px] ${outbound ? "text-white/70" : "text-slate-500"}`}>
                  {clockTime(m.received_at)}
                  {outbound && " · sent natively"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* the human gate */}
      <div className="border-t border-white/[0.06] bg-ink-900/60 p-4 sm:p-5">
        {result ? (
          <ResolvedBanner result={result} channelLabel={channel.label} />
        ) : alreadyHandled ? (
          <div className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
            This interaction is already {interaction.status}.
          </div>
        ) : !channel.supports_dm && !isReview && interaction.kind === "message" ? (
          <PolicyWall label={channel.label} note={channel.constraint_note} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-soft">
                <SparkIcon />
                AI-drafted reply · human approval required
              </div>
              <div className="flex items-center gap-2">
                {interaction.draft?.requires_escalation && <EscalationFlag />}
                {interaction.draft && <ConfidenceMeter value={interaction.draft.confidence} />}
              </div>
            </div>

            <textarea
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                setEdited(e.target.value !== (interaction.draft?.text ?? ""));
              }}
              rows={4}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3.5 text-sm text-slate-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              placeholder="Write a reply…"
            />

            {!send_policy.allowed && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 text-xs text-amber-200">
                {send_policy.reason}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <NativeIcon />
                Sends natively into the customer&apos;s own {channel.label} thread
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => act("reject")}
                  disabled={sending}
                  className="rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => act("approve")}
                  disabled={sending || !send_policy.allowed}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending…" : edited ? "Approve edit & send" : "Approve & send"}
                </button>
              </div>
            </div>
            {edited && (
              <div className="text-right text-[11px] text-slate-500">
                Your edit is recorded as brand-voice training signal.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResolvedBanner({ result, channelLabel }: { result: string; channelLabel: string }) {
  const dismissed = result === "dismissed";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm ${
        dismissed
          ? "bg-slate-500/10 text-slate-300"
          : "bg-emerald-500/12 text-emerald-200"
      }`}
    >
      <span className="text-lg">{dismissed ? "🗂️" : "✅"}</span>
      {dismissed ? (
        <span>Dismissed — removed from the attention backlog.</span>
      ) : (
        <span>
          <span className="font-semibold text-white">Sent natively</span> into the customer&apos;s{" "}
          {result} thread. Marked answered.
        </span>
      )}
    </div>
  );
}

function PolicyWall({ label, note }: { label: string; note: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <LockIcon />
        No direct messaging on {label}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{note}</p>
      <p className="mt-2 text-xs text-slate-500">
        We show the truth about platform limits rather than a fake inbox. Comments and mentions are
        available under Comments.
      </p>
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
