"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ChannelInfo, Subscription, CheckoutResult } from "@/lib/types";
import { channelColor } from "@/lib/channels";
import { ChannelBadge } from "@/components/ChannelIcon";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, StatusPill } from "@/components/ui";
import { naira } from "@/lib/format";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Channel connections and Naira-native subscription billing via Monnify."
      />
      <Billing />
      <Channels />
    </div>
  );
}

/* ---------------------------------------------------------------- Billing */

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  active: "good",
  trial: "accent",
  past_due: "warn",
  grace: "warn",
  read_only: "bad",
  cancelled: "bad",
};

function Billing() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [checkout, setCheckout] = useState<(CheckoutResult & { tier: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  const load = () => api.subscription().then(setSub);
  useEffect(() => {
    load();
  }, []);

  if (!sub) return <Spinner label="Loading billing…" />;

  async function startCheckout(tier: string) {
    setBusy(true);
    setJustActivated(false);
    const res = await api.checkout(tier);
    setBusy(false);
    setCheckout({ ...res, tier });
  }

  async function completePayment() {
    if (!checkout) return;
    setBusy(true);
    // Activation happens server-side after the payment is verified — the client
    // only asks the backend to confirm, it never grants entitlement itself.
    await api.simulatePayment(checkout.payment_reference);
    await load();
    setBusy(false);
    setCheckout(null);
    setJustActivated(true);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-white">Billing</h2>
        <span className="chip bg-white/[0.06] text-slate-400">Monnify · NGN</span>
      </div>

      {/* current subscription */}
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl font-bold text-white">{sub.tier_label}</span>
              <StatusPill
                label={sub.status_label}
                tone={STATUS_TONE[sub.status] ?? "neutral"}
                pulse={sub.status === "active"}
              />
              {justActivated && (
                <span className="animate-fade-up chip bg-emerald-500/16 text-emerald-300">
                  ✓ Activated live
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {sub.status === "trial"
                ? `Free trial · ${sub.days_remaining ?? 0} days remaining`
                : sub.amount_ngn > 0
                ? `${naira(sub.amount_ngn)}/month · renews in ${sub.days_remaining ?? 0} days`
                : "No active paid plan"}
            </p>
          </div>
          <div className="flex gap-5 text-center">
            <Limit label="Channels" value={String(sub.limits.channels)} />
            <Limit label="Seats" value={String(sub.limits.seats)} />
            <Limit
              label="AI drafts"
              value={sub.limits.ai_drafts === null ? "∞" : sub.limits.ai_drafts.toLocaleString()}
            />
          </div>
        </div>
      </div>

      {/* tiers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {sub.tiers.map((t) => {
          const current = t.tier === sub.tier && sub.status !== "trial";
          const highlight = t.tier === "growth";
          return (
            <div
              key={t.tier}
              className={`panel relative flex flex-col p-5 ${
                highlight ? "ring-1 ring-accent/40" : ""
              }`}
            >
              {highlight && (
                <span className="absolute -top-2.5 left-5 chip bg-accent px-2.5 text-[11px] text-white">
                  Recommended
                </span>
              )}
              <div className="text-sm font-semibold text-slate-300">{t.label}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{naira(t.price_ngn)}</span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-400">
                <Feature>{t.limits.channels} channels</Feature>
                <Feature>{t.limits.seats} team seat{t.limits.seats > 1 ? "s" : ""}</Feature>
                <Feature>
                  {t.limits.ai_drafts === null
                    ? "Unlimited AI drafts"
                    : `${t.limits.ai_drafts.toLocaleString()} AI drafts / mo`}
                </Feature>
                {t.tier !== "starter" && <Feature>Google Reviews included</Feature>}
              </ul>
              <button
                disabled={current || busy}
                onClick={() => startCheckout(t.tier)}
                className={`mt-5 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  current
                    ? "border border-white/10 text-slate-500"
                    : highlight
                    ? "bg-accent text-white shadow-glow hover:bg-accent-glow"
                    : "border border-white/10 text-white hover:bg-white/[0.06]"
                }`}
              >
                {current ? "Current plan" : `Choose ${t.label}`}
              </button>
            </div>
          );
        })}
      </div>

      {checkout && (
        <MonnifyCheckout
          checkout={checkout}
          busy={busy}
          onPay={completePayment}
          onClose={() => setCheckout(null)}
        />
      )}
    </section>
  );
}

function MonnifyCheckout({
  checkout,
  busy,
  onPay,
  onClose,
}: {
  checkout: CheckoutResult & { tier: string };
  busy: boolean;
  onPay: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-accent text-xs font-bold text-white">
              M
            </div>
            <span className="font-semibold text-white">Monnify checkout</span>
            {checkout.simulated && (
              <span className="chip bg-amber-500/14 text-amber-300">Sandbox</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl bg-black/25 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Command Centre — {checkout.tier} (monthly)</span>
              <span className="text-lg font-bold text-white">{naira(checkout.amount_ngn)}</span>
            </div>
            <div className="mt-2 truncate text-[11px] text-slate-500">
              Ref: {checkout.payment_reference}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 p-3 text-center text-xs text-slate-300">
              💳 Card
              <div className="text-[10px] text-slate-500">tokenised recurring</div>
            </div>
            <div className="rounded-xl border border-white/10 p-3 text-center text-xs text-slate-300">
              🏦 Bank transfer
              <div className="text-[10px] text-slate-500">reserved account</div>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Payments are processed securely by Monnify on the server. Your subscription only
            activates once the payment is verified — never from a client-side success screen.
          </p>

          <button
            onClick={onPay}
            disabled={busy}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy
              ? "Confirming payment…"
              : checkout.simulated
              ? "Complete payment →"
              : "Pay now →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-400" stroke="currentColor" strokeWidth="2">
        <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  );
}

/* --------------------------------------------------------------- Channels */

function Channels() {
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null);
  useEffect(() => {
    api.channels().then(setChannels);
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Channel connections</h2>
        <p className="text-sm text-slate-500">
          What each platform actually permits — encoded, not hidden.
        </p>
      </div>
      {!channels ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {channels.map((c) => (
            <div key={c.channel} className="panel panel-hover p-4">
              <div className="flex items-start gap-3">
                <ChannelBadge channel={c.channel} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{c.label}</span>
                    {c.connected ? (
                      <span className="chip bg-emerald-500/12 text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Connected
                      </span>
                    ) : (
                      <span className="chip bg-slate-500/12 text-slate-400">Not connected</span>
                    )}
                  </div>
                  {c.handle && <div className="text-xs text-slate-500">{c.handle}</div>}
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {cleanNote(c.constraint_note)}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Cap ok={c.supports_dm} label="DMs" />
                    <Cap ok={c.supports_comments} label="Comments" />
                    <Cap ok={c.supports_publish} label="Publish" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Drop any sentence that references delivery transport (webhooks/polling) —
// an implementation detail we don't surface in Settings.
function cleanNote(note: string): string {
  return note
    .split(/(?<=\.)\s+/)
    .filter((s) => !/webhook|polled|poll /i.test(s))
    .join(" ")
    .trim();
}

function Cap({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`chip text-[10px] ${
        ok ? "bg-emerald-500/12 text-emerald-300" : "bg-white/[0.04] text-slate-500 line-through"
      }`}
    >
      {label}
    </span>
  );
}
