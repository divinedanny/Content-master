"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Attention } from "@/lib/types";
import { channelColor, channelLabel } from "@/lib/channels";
import { ChannelBadge } from "@/components/ChannelIcon";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/ui";

export default function HomePage() {
  const [data, setData] = useState<Attention | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .attention()
      .then(setData)
      .catch(() => setError("Could not reach the backend. Is it running on :8000?"));
  }, []);

  if (error) return <BackendError message={error} />;
  if (!data) return <Spinner label="Loading attention dashboard…" />;

  const neglected = data.most_neglected;
  const maxUnanswered = Math.max(1, ...data.per_channel.map((c) => c.unanswered));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attention"
        subtitle="One screen where no customer is invisible. Every platform, ranked by who has been waiting longest."
      >
        <Link
          href="/messages"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow"
        >
          Clear the backlog →
        </Link>
      </PageHeader>

      {/* The narrative line — the pitch in one sentence */}
      {neglected && data.total_unanswered > 0 && (
        <div className="animate-fade-up rounded-2xl border border-rose-500/20 bg-gradient-to-r from-rose-500/[0.08] to-transparent px-5 py-4 text-sm text-slate-200 sm:text-base">
          <span className="font-semibold text-white">{data.total_unanswered} customers</span> are
          waiting for a reply — the oldest for{" "}
          <span className="font-semibold text-rose-300">{data.oldest_wait_label}</span>. Most of
          them are on{" "}
          <span className="font-semibold" style={{ color: channelColor(neglected.channel) }}>
            {neglected.label}
          </span>
          , because attention leaked to whichever app was open.
        </div>
      )}

      {/* Hero stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Unanswered now"
          value={String(data.total_unanswered)}
          sub="across all channels"
          tone="bad"
          big
        />
        <StatCard
          label="Oldest waiting"
          value={data.oldest_wait_label}
          sub="first-in, still unanswered"
          tone="warn"
        />
        <StatCard
          label="Median first response"
          value={data.median_first_response_label}
          sub="target < 5 min"
          tone="accent"
        />
        <StatCard
          label="Answered within 5 min"
          value={
            data.answered_within_5min_pct !== null
              ? `${data.answered_within_5min_pct}%`
              : "—"
          }
          sub="the headline SLA"
          tone={
            (data.answered_within_5min_pct ?? 0) >= 50 ? "good" : "warn"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Response equity — the differentiator */}
        <section className="panel lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="font-semibold text-white">Response equity</h2>
              <p className="text-xs text-slate-500">
                Unanswered load per channel — the taller the bar, the more neglected.
              </p>
            </div>
            <span className="chip bg-white/[0.06] text-slate-300">Differentiator</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {data.per_channel.map((c) => {
              const isNeglected = neglected?.channel === c.channel;
              const width = Math.round((c.unanswered / maxUnanswered) * 100);
              return (
                <Link
                  key={c.channel}
                  href={`/messages?channel=${c.channel}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                >
                  <ChannelBadge channel={c.channel} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                        {c.label}
                        {isNeglected && (
                          <span className="chip bg-rose-500/14 text-rose-300">Most neglected</span>
                        )}
                      </span>
                      <span className="text-xs text-slate-500">
                        {c.unanswered} waiting · {c.answer_rate}% answered
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(width, c.unanswered > 0 ? 8 : 0)}%`,
                          background: channelColor(c.channel),
                          opacity: isNeglected ? 1 : 0.75,
                        }}
                      />
                    </div>
                  </div>
                  <div className="hidden w-20 shrink-0 text-right sm:block">
                    <div className="text-xs text-slate-500">median</div>
                    <div className="text-sm font-medium text-slate-300">
                      {c.median_response_label}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Most neglected spotlight */}
        <section className="panel flex flex-col p-5">
          <h2 className="font-semibold text-white">Where to look first</h2>
          {neglected ? (
            <div className="mt-4 flex flex-1 flex-col">
              <div
                className="rounded-2xl p-5"
                style={{
                  background: `${channelColor(neglected.channel)}14`,
                  boxShadow: `inset 0 0 0 1px ${channelColor(neglected.channel)}33`,
                }}
              >
                <div className="flex items-center gap-3">
                  <ChannelBadge channel={neglected.channel} size={44} />
                  <div>
                    <div className="text-lg font-bold text-white">{neglected.label}</div>
                    <div className="text-xs text-slate-400">
                      {neglected.answer_rate}% answer rate
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniStat label="Waiting" value={String(neglected.unanswered)} />
                  <MiniStat label="Oldest" value={neglected.oldest_label} />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                This is the channel paying the price for divided attention. Start here.
              </p>
              <Link
                href={`/messages?channel=${neglected.channel}`}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                Open {neglected.label} inbox →
              </Link>
            </div>
          ) : (
            <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center text-sm text-slate-400">
              <div className="mb-2 text-3xl">✅</div>
              Inbox zero. No customer is waiting.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  big = false,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "bad" | "warn" | "good" | "accent";
  big?: boolean;
}) {
  const glow: Record<string, string> = {
    bad: "from-rose-500/[0.10]",
    warn: "from-amber-500/[0.10]",
    good: "from-emerald-500/[0.10]",
    accent: "from-accent/[0.10]",
  };
  const valueColor: Record<string, string> = {
    bad: "text-rose-300",
    warn: "text-amber-300",
    good: "text-emerald-300",
    accent: "text-accent-soft",
  };
  return (
    <div
      className={`panel panel-hover animate-fade-up bg-gradient-to-b ${glow[tone]} to-transparent p-4 sm:p-5`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 font-bold tracking-tight ${valueColor[tone]} ${big ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function BackendError({ message }: { message: string }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-6 text-center">
      <div className="mb-3 text-3xl">🔌</div>
      <h2 className="text-lg font-semibold text-white">Backend unreachable</h2>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-3 text-left text-xs text-slate-300">
{`cd backend
python manage.py migrate && python manage.py seed_demo
python manage.py runserver 8000`}
      </pre>
    </div>
  );
}
