"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { Analytics, Attention, Post } from "@/lib/types";
import { channelColor, channelLabel } from "@/lib/channels";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/ui";
import { humanizeSeconds } from "@/lib/format";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    api.analytics().then(setAnalytics);
    api.attention().then(setAttention);
    api.posts().then(setPosts);
  }, []);

  if (!analytics || !attention || !posts) return <Spinner label="Loading analytics…" />;

  const equity = attention.per_channel
    .filter((c) => c.median_response_seconds !== null)
    .map((c) => ({
      channel: c.channel,
      label: c.label,
      seconds: c.median_response_seconds ?? 0,
      answer_rate: c.answer_rate,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const ts = analytics.timeseries;
  const merged = (ts.reach || []).map((r, idx) => ({
    date: r.date.slice(5),
    reach: r.value,
    impressions: ts.impressions?.[idx]?.value ?? 0,
    engagement: ts.engagement?.[idx]?.value ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Vanity metrics are table stakes. Response equity — are we neglecting a channel — is the number that matters."
      />

      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile label="Avg reach / post" value={fmt(analytics.summary.reach)} />
        <Tile label="Avg impressions" value={fmt(analytics.summary.impressions)} />
        <Tile label="Avg engagement" value={fmt(analytics.summary.engagement)} />
        <Tile label="Followers" value={fmt(analytics.summary.followers)} />
      </div>

      {/* response equity — the differentiator */}
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Response equity</h2>
            <p className="text-xs text-slate-500">
              Median first-response time per channel. A tall bar is a neglected channel.
            </p>
          </div>
          <span className="chip bg-accent/14 text-accent-soft">Our differentiator</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={equity} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                type="number"
                tickFormatter={(v) => humanizeSeconds(v)}
                stroke="#64748b"
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={78}
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-xs shadow-panel">
                      <div className="font-semibold text-white">{d.label}</div>
                      <div className="text-slate-300">Median response: {humanizeSeconds(d.seconds)}</div>
                      <div className="text-slate-400">Answer rate: {d.answer_rate}%</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="seconds" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
                {equity.map((e) => (
                  <Cell key={e.channel} fill={channelColor(e.channel as any)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* engagement timeseries */}
      <section className="panel p-5">
        <h2 className="font-semibold text-white">Reach & engagement — last 14 days</h2>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged} margin={{ left: -10, right: 8 }}>
              <defs>
                <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gImp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e1306c" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#e1306c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(100,116,139,0.18)" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmt} />
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--ink-800))",
                  color: "rgb(var(--fg))",
                  border: "1px solid rgba(100,116,139,0.25)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "rgb(var(--fg))" }}
              />
              <Area type="monotone" dataKey="impressions" stroke="#e1306c" fill="url(#gImp)" strokeWidth={2} isAnimationActive={false} />
              <Area type="monotone" dataKey="reach" stroke="#5b8cff" fill="url(#gReach)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-400">
          <Legend color="#5b8cff" label="Reach" />
          <Legend color="#e1306c" label="Impressions" />
        </div>
      </section>

      {/* per-post table */}
      <section className="panel overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="font-semibold text-white">Per-post performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Post</th>
                <th className="px-3 py-3 font-medium">Channels</th>
                <th className="px-3 py-3 font-medium text-right">Impressions</th>
                <th className="px-5 py-3 font-medium text-right">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="max-w-xs px-5 py-3">
                    <div className="truncate text-slate-200">{p.body}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {p.target_channels.map((ch) => (
                        <span
                          key={ch}
                          className="h-2 w-2 rounded-full"
                          style={{ background: channelColor(ch) }}
                          title={channelLabel(ch)}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300">
                    {p.total_impressions.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">
                    {p.total_engagements.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel animate-fade-up p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white sm:text-3xl">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
