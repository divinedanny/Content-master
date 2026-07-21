"use client";

import { useEffect, useState } from "react";
import { api, type NotifyPrefs, type TenantSettings } from "@/lib/api";
import type { ChannelInfo, Subscription, CheckoutResult } from "@/lib/types";
import { channelColor } from "@/lib/channels";
import { ChannelBadge } from "@/components/ChannelIcon";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, StatusPill } from "@/components/ui";
import { naira } from "@/lib/format";
import { auth } from "@/lib/auth";
import { AppearanceSettings } from "@/components/AppearanceSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Settings"
        subtitle="Account, channel connections, AI brand voice, notifications and billing."
      />
      <Account />
      <AppearanceSettings />
      <BrandVoice />
      <Notifications />
      <Billing />
      <Channels />
    </div>
  );
}

/* --------------------------------------------------------------- Account */

function Account() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  useEffect(() => {
    const u = auth.getUser();
    if (u) {
      setName(u.name);
      setEmail(u.email);
    }
  }, []);

  async function saveProfile() {
    setMsg(null);
    const res = await api.updateProfile({ name, email });
    if (res.__status && res.__status >= 400) {
      setMsg(res.error || "Could not save.");
    } else {
      await auth.refresh();
      setMsg("Saved.");
    }
  }

  async function changePw() {
    setPwMsg(null);
    const res = await api.changePassword(current, next);
    if (res.__status && res.__status >= 400) {
      setPwMsg(res.error || "Could not change password.");
    } else {
      if (res.token) auth.setSession(res.token, auth.getUser()!);
      setCurrent("");
      setNext("");
      setPwMsg("Password changed.");
    }
  }

  return (
    <Section title="Account" subtitle="Your profile and sign-in details.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Labeled label="Full name">
          <Input value={name} onChange={setName} />
        </Labeled>
        <Labeled label="Email">
          <Input value={email} onChange={setEmail} type="email" />
        </Labeled>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SaveButton onClick={saveProfile}>Save profile</SaveButton>
        {msg && <Note text={msg} />}
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <div className="mb-3 text-sm font-semibold text-slate-200">Change password</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Labeled label="Current password">
            <Input value={current} onChange={setCurrent} type="password" />
          </Labeled>
          <Labeled label="New password">
            <Input value={next} onChange={setNext} type="password" />
          </Labeled>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton onClick={changePw} disabled={!current || !next}>Update password</SaveButton>
          {pwMsg && <Note text={pwMsg} />}
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------- Brand voice & quiet hours */

function BrandVoice() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.tenantSettings().then(setSettings).catch(() => {});
  }, []);

  if (!settings) return <Section title="Brand voice & quiet hours"><Spinner /></Section>;

  async function save() {
    setMsg(null);
    const res = await api.saveTenantSettings(settings!);
    if (res.__status && res.__status >= 400) setMsg("Could not save.");
    else setMsg("Saved.");
  }

  return (
    <Section
      title="Brand voice & quiet hours"
      subtitle="Guidance injected into AI drafts, and the window the outbound queue may send proactive messages."
    >
      <Labeled label="Brand voice / knowledge">
        <textarea
          value={settings.brand_voice}
          onChange={(e) => setSettings({ ...settings, brand_voice: e.target.value })}
          rows={4}
          className="w-full resize-none rounded-xl border border-white/10 bg-field p-3 text-sm text-slate-100 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          placeholder="e.g. Warm, professional Nigerian customer service. Never promise a price without confirming."
        />
      </Labeled>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-xs">
        <Labeled label="Quiet hours start">
          <Input
            type="time"
            value={settings.quiet_hours_start}
            onChange={(v) => setSettings({ ...settings, quiet_hours_start: v })}
          />
        </Labeled>
        <Labeled label="Quiet hours end">
          <Input
            type="time"
            value={settings.quiet_hours_end}
            onChange={(v) => setSettings({ ...settings, quiet_hours_end: v })}
          />
        </Labeled>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SaveButton onClick={save}>Save</SaveButton>
        {msg && <Note text={msg} />}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ Notifications */

const NOTIF_EVENTS: { key: string; label: string }[] = [
  { key: "new_message", label: "New direct message" },
  { key: "mention", label: "New @mention" },
  { key: "review", label: "New review" },
];

function Notifications() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const u = auth.getUser();
    if (u?.notify_prefs) setPrefs(u.notify_prefs);
    else auth.refresh().then((x) => x?.notify_prefs && setPrefs(x.notify_prefs));
  }, []);

  if (!prefs) return <Section title="Notifications"><Spinner /></Section>;

  function toggle(event: string, channel: "in_app" | "email") {
    setPrefs((p) => ({
      ...p!,
      [event]: { ...p![event], [channel]: !p![event]?.[channel] },
    }));
  }

  async function save() {
    setMsg(null);
    await api.saveNotifications(prefs!);
    const u = auth.getUser();
    if (u) auth.setUser({ ...u, notify_prefs: prefs! });
    setMsg("Saved.");
  }

  return (
    <Section title="Notifications" subtitle="Choose what reaches you, and where.">
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <span>Event</span>
          <span className="text-center">In-app</span>
          <span className="text-center">Email</span>
        </div>
        {NOTIF_EVENTS.map((ev) => (
          <div key={ev.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 py-3 text-sm">
            <span className="text-slate-200">{ev.label}</span>
            <Toggle on={!!prefs[ev.key]?.in_app} onClick={() => toggle(ev.key, "in_app")} />
            <Toggle on={!!prefs[ev.key]?.email} onClick={() => toggle(ev.key, "email")} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SaveButton onClick={save}>Save preferences</SaveButton>
        {msg && <Note text={msg} />}
      </div>
    </Section>
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
                <span className="absolute -top-2.5 left-5 chip bg-accent px-2.5 text-[11px] text-[#fff]">
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
                    ? "bg-accent text-[#fff] shadow-glow hover:bg-accent-glow"
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
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-accent text-xs font-bold text-[#fff]">
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
          <div className="rounded-xl bg-field p-4">
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
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#fff] shadow-[0_6px_20px_rgba(16,185,129,0.3)] transition hover:bg-emerald-400 disabled:opacity-50"
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
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const load = () => api.channels().then(setChannels);
  useEffect(() => {
    load();
  }, []);

  // Land back here after an OAuth round trip (see core/oauth/views.py's
  // final redirect) and surface how it went, once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauth_error");
    if (connected) {
      setBanner({ tone: "good", text: `Connected your real ${connected} account.` });
      load();
    } else if (oauthError) {
      setBanner({ tone: "bad", text: `Couldn't connect: ${oauthError.replace(/_/g, " ")}.` });
    }
    if (connected || oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function toggle(c: ChannelInfo) {
    if (c.connected) {
      setBusy(c.channel);
      await api.disconnectChannel(c.channel);
      await load();
      setBusy(null);
      return;
    }
    // A real, configured provider connects the user's actual account via
    // OAuth (a full browser redirect); everything else falls back to the
    // instant mock connect so the demo still works with no setup.
    if (c.oauth_configured) {
      setBusy(c.channel);
      const res = await api.startOAuth(c.channel);
      if (res.authorize_url) {
        window.location.href = res.authorize_url;
        return; // navigating away — no need to clear busy
      }
      setBanner({ tone: "bad", text: res.error || "Could not start the connection." });
      setBusy(null);
      return;
    }
    setBusy(c.channel);
    await api.connectChannel(c.channel);
    await load();
    setBusy(null);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Channel connections</h2>
        <p className="text-sm text-slate-500">
          Connect your real account where it's configured; otherwise a demo connection stands in.
          What each platform actually permits is encoded, not hidden.
        </p>
      </div>
      {banner && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            banner.tone === "good"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {banner.text}
        </div>
      )}
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
                        {c.is_mock ? "Connected (demo)" : "Connected"}
                      </span>
                    ) : (
                      <span className="chip bg-slate-500/12 text-slate-400">Not connected</span>
                    )}
                  </div>
                  {c.handle && <div className="text-xs text-slate-500">{c.handle}</div>}
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {cleanNote(c.constraint_note)}
                  </p>
                  {!c.connected && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {c.oauth_configured
                        ? "Connects your real account."
                        : c.channel === "whatsapp"
                        ? "Uses the WhatsApp Cloud API token in .env, not OAuth."
                        : "No real account configured — connects a demo account instead."}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Cap ok={c.supports_dm} label="DMs" />
                    <Cap ok={c.supports_comments} label="Comments" />
                    <Cap ok={c.supports_publish} label="Publish" />
                  </div>
                  <button
                    onClick={() => toggle(c)}
                    disabled={busy === c.channel}
                    className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      c.connected
                        ? "border border-white/10 text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
                        : "bg-accent/90 text-[#fff] hover:bg-accent"
                    }`}
                  >
                    {busy === c.channel
                      ? "…"
                      : c.connected
                      ? "Disconnect"
                      : c.oauth_configured
                      ? "Connect account"
                      : "Connect"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------- shared bits */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="panel p-5">{children}</div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-field px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
    />
  );
}

function SaveButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#fff] shadow-glow transition hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Note({ text }: { text: string }) {
  return <span className="text-xs text-emerald-300">{text}</span>;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`mx-auto flex h-5 w-9 items-center rounded-full p-0.5 transition ${
        on ? "bg-accent" : "bg-white/10"
      }`}
      role="switch"
      aria-checked={on}
    >
      <span className={`h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
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
