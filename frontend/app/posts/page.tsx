"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ChannelKey, Post } from "@/lib/types";
import { CHANNELS, channelColor, channelLabel } from "@/lib/channels";
import { ChannelBadge } from "@/components/ChannelIcon";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/ui";
import { dateLabel } from "@/lib/format";

const PUBLISHABLE: ChannelKey[] = ["instagram", "facebook", "tiktok", "linkedin", "x"];

// Per-platform character guidance for the preview.
const LIMITS: Partial<Record<ChannelKey, number>> = {
  x: 280,
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  tiktok: 2200,
};

export default function PostsPage() {
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<ChannelKey[]>(["instagram", "facebook"]);
  const [hasMedia, setHasMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<{ channel: string; success: boolean; error: string }[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  const loadPosts = () => api.posts().then(setPosts);
  useEffect(() => {
    loadPosts();
  }, []);

  function toggle(ch: ChannelKey) {
    setResults(null);
    setTargets((t) => (t.includes(ch) ? t.filter((c) => c !== ch) : [...t, ch]));
  }

  async function publish() {
    if (!body.trim() || targets.length === 0) return;
    setPublishing(true);
    setResults(null);
    const res = await api.publish(body, targets, hasMedia ? ["image:demo.jpg"] : []);
    setPublishing(false);
    setResults(res.results);
    await loadPosts();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posts"
        subtitle="Write once, preview per platform, publish everywhere it's allowed — with the real platform constraints applied."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* composer */}
        <section className="panel p-5">
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setResults(null);
            }}
            rows={5}
            placeholder="Share an update with your customers…"
            className="w-full resize-none rounded-xl border border-white/10 bg-field p-4 text-sm text-slate-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />

          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={hasMedia}
              onChange={(e) => {
                setHasMedia(e.target.checked);
                setResults(null);
              }}
              className="h-4 w-4 accent-accent"
            />
            Attach media (image/video)
          </label>

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Publish to
            </div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.filter((c) => PUBLISHABLE.includes(c.key)).map((c) => {
                const on = targets.includes(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                      on ? "border-transparent text-white" : "border-white/10 text-slate-400"
                    }`}
                    style={
                      on
                        ? { background: `${c.color}22`, boxShadow: `inset 0 0 0 1px ${c.color}66` }
                        : undefined
                    }
                  >
                    <ChannelBadge channel={c.key} size={20} />
                    {c.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              WhatsApp and Google Reviews don&apos;t support publishing via API — they&apos;re
              inbound-only, so they&apos;re not offered here.
            </p>
          </div>

          <button
            onClick={publish}
            disabled={publishing || !body.trim() || targets.length === 0}
            className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-[#fff] shadow-glow transition hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? "Publishing…" : `Publish to ${targets.length} platform${targets.length === 1 ? "" : "s"}`}
          </button>

          {results && (
            <div className="mt-4 space-y-2">
              {results.map((r) => (
                <div
                  key={r.channel}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
                    r.success ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"
                  }`}
                >
                  <ChannelBadge channel={r.channel as ChannelKey} size={22} />
                  <span className="font-medium">{channelLabel(r.channel as ChannelKey)}</span>
                  <span className="ml-auto text-xs">
                    {r.success ? "✓ Published" : r.error || "Failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* previews */}
        <section className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Per-platform preview
          </div>
          {targets.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-slate-500">
              Select a platform to preview.
            </div>
          ) : (
            targets.map((ch) => (
              <Preview key={ch} channel={ch} body={body} hasMedia={hasMedia} />
            ))
          )}
        </section>
      </div>

      {/* recent posts */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Recent posts</h2>
        {!posts ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {posts.map((p) => (
              <div key={p.id} className="panel p-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {p.target_channels.map((ch) => (
                      <ChannelBadge key={ch} channel={ch} size={22} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">
                    {p.published_at ? dateLabel(p.published_at) : "—"}
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-slate-300">{p.body}</p>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span>{p.total_impressions.toLocaleString()} impressions</span>
                  <span>{p.total_engagements.toLocaleString()} engagements</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Preview({ channel, body, hasMedia }: { channel: ChannelKey; body: string; hasMedia: boolean }) {
  const limit = LIMITS[channel];
  const over = limit ? body.length > limit : false;
  const needsMedia = channel === "tiktok" && !hasMedia;
  const color = channelColor(channel);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <ChannelBadge channel={channel} size={24} />
        <span className="text-sm font-medium text-slate-200">{channelLabel(channel)}</span>
        {limit && (
          <span className={`ml-auto text-[11px] ${over ? "text-rose-400" : "text-slate-500"}`}>
            {body.length}/{limit}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full" style={{ background: `${color}33` }} />
          <div>
            <div className="text-sm font-semibold text-white">Avion Hub</div>
            <div className="text-[11px] text-slate-500">@avionhub · now</div>
          </div>
        </div>
        <p className="mt-2.5 whitespace-pre-wrap text-sm text-slate-200">
          {body || <span className="text-slate-600">Your message will appear here…</span>}
        </p>
        {hasMedia && (
          <div
            className="mt-3 flex h-32 items-center justify-center rounded-xl text-xs text-slate-500"
            style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}22` }}
          >
            🖼️ media attached
          </div>
        )}
        {needsMedia && (
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200">
            TikTok requires media — text-only posts are rejected by the platform.
          </div>
        )}
        {over && (
          <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-200">
            Over the {limit}-character limit for {channelLabel(channel)}.
          </div>
        )}
      </div>
    </div>
  );
}
