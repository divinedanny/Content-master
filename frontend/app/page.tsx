"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Nav";
import { CHANNELS, channelColor } from "@/lib/channels";
import { ChannelBadge } from "@/components/ChannelIcon";
import { auth } from "@/lib/auth";

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(!!auth.getToken());
  }, []);

  const primaryHref = signedIn ? "/dashboard" : "/register";
  const primaryLabel = signedIn ? "Go to dashboard" : "Get started free";

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Brand />
          <nav className="flex items-center gap-2 sm:gap-3">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 transition hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="chip animate-fade-up mx-auto mb-6 w-fit bg-white/[0.05] text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            By Dayne Core Technologies · Built for conversational commerce
          </span>
          <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            One inbox that <span className="text-accent-soft">measures</span> — and closes —
            <br className="hidden sm:block" /> your attention leak.
          </h1>
          <p className="animate-fade-up mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg">
            WhatsApp, Instagram, Facebook, TikTok, LinkedIn, X and Google Reviews, side by side.
            Command Centre shows exactly who&apos;s waiting, drafts the reply, and lets a human send
            it natively — so no customer falls through the cracks.
          </p>
          <div className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow sm:w-auto"
            >
              {primaryLabel} →
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="w-full rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.05] sm:w-auto"
              >
                Sign in
              </Link>
            )}
          </div>

          {/* Channel row */}
          <div className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-3">
            {CHANNELS.map((c) => (
              <div
                key={c.key}
                className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-ink-850/60 px-3 py-1.5"
              >
                <ChannelBadge channel={c.key} size={22} />
                <span className="text-xs font-medium text-slate-300">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem → Solution */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="panel p-6 sm:p-8">
            <div className="chip mb-3 w-fit bg-rose-500/12 text-rose-300">The problem</div>
            <h2 className="text-xl font-bold text-white">Attention can&apos;t be in six places at once</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              While the owner is deep in one WhatsApp chat, Instagram DMs go unanswered, a Facebook
              &ldquo;is this available?&rdquo; sits cold, and a 2-star review festers for nine days.
              Nobody is negligent — attention simply <span className="text-slate-200">leaked</span>,
              and the ignored customer doesn&apos;t complain. They buy elsewhere, silently.
            </p>
          </div>
          <div className="panel p-6 sm:p-8">
            <div className="chip mb-3 w-fit bg-emerald-500/12 text-emerald-300">The solution</div>
            <h2 className="text-xl font-bold text-white">Allocate attention by urgency, not by which app is open</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              A live Attention Leak dashboard surfaces who&apos;s waiting and the most-neglected
              channel. Every thread is a real two-way conversation with an AI-drafted reply you
              approve, edit or ignore — sent <span className="text-slate-200">natively</span> into
              the customer&apos;s own platform thread. It survives flaky networks, and bills in Naira.
            </p>
          </div>
        </div>

        {/* Feature grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel panel-hover p-5">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div
          className="panel overflow-hidden p-8 text-center sm:p-12"
          style={{ background: `linear-gradient(135deg, ${channelColor("instagram")}14, ${channelColor("whatsapp")}10)` }}
        >
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Stop leaking customers to your own inbox.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300">
            Sign in, connect your social accounts, and give every customer attention at once.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow sm:w-auto"
            >
              {primaryLabel} →
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="w-full rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.05] sm:w-auto"
              >
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Dayne Core Technologies · Command Centre
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: "📊",
    title: "Attention Leak dashboard",
    body: "Unanswered count, oldest wait, and per-channel response equity — the number that makes the problem undeniable.",
  },
  {
    icon: "💬",
    title: "Two-way native messaging",
    body: "Start, continue and reply on any platform. Replies land in the customer's own thread — not a bridge or relay.",
  },
  {
    icon: "✨",
    title: "AI drafts, human sends",
    body: "Every reply is drafted for you and sent only when you approve. The AI assists; it never auto-sends.",
  },
  {
    icon: "📴",
    title: "Works on flaky networks",
    body: "Compose offline and it delivers the moment you reconnect — never lost, never sent twice.",
  },
  {
    icon: "🏦",
    title: "Naira-native billing",
    body: "Subscriptions via Monnify — card or bank transfer. Built for how Lagos SMEs actually pay.",
  },
  {
    icon: "🔗",
    title: "Connect your own accounts",
    body: "Link your real WhatsApp, Instagram and more. Mock for the demo, live when you're ready — a config switch.",
  },
];
