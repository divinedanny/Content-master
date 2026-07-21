import type {
  Analytics,
  Attention,
  ChannelInfo,
  CheckoutResult,
  Interaction,
  Post,
  Subscription,
  ThreadResponse,
  ApproveResult,
} from "./types";
import { auth } from "./auth";

// Default to same-origin ("") so requests go through the Next.js proxy
// (see next.config.mjs rewrites). This keeps the app on a single origin, which
// is what lets one exposed port serve the whole app to an external tester.
// Set NEXT_PUBLIC_API_BASE only to point the browser at a separate backend host.
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

// On an auth failure, drop the session and bounce to /login.
function handleAuthFailure(status: number) {
  if (typeof window === "undefined") return;
  if (status !== 401 && status !== 403) return;
  const onAuthPage = ["/login", "/register", "/forgot-password", "/reset-password"].some((p) =>
    window.location.pathname.startsWith(p)
  );
  if (!onAuthPage) {
    auth.clear();
    window.location.href = "/login";
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { ...auth.authHeader() },
  });
  if (!res.ok) {
    handleAuthFailure(res.status);
    throw new Error(`GET ${path} → ${res.status}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth.authHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAuthFailure(res.status);
    // Return the parsed error body so callers can show the message (e.g. 409 policy)
    return { __status: res.status, ...data } as T;
  }
  return data as T;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth.authHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAuthFailure(res.status);
    return { __status: res.status, ...data } as T;
  }
  return data as T;
}

export const api = {
  base: BASE,

  attention: () => get<Attention>("/api/attention/"),
  channels: () => get<ChannelInfo[]>("/api/channels/"),

  inbox: (params: { channel?: string; kind?: string; unanswered?: boolean }) => {
    const q = new URLSearchParams();
    q.set("channel", params.channel ?? "all");
    q.set("kind", params.kind ?? "message");
    if (params.unanswered) q.set("unanswered", "true");
    return get<Interaction[]>(`/api/inbox/?${q.toString()}`);
  },

  thread: (id: number) => get<ThreadResponse>(`/api/inbox/${id}/thread/`),

  approve: (id: number, decision: "approve" | "edit" | "reject", text?: string) =>
    post<ApproveResult & { __status?: number }>(`/api/inbox/${id}/approve/`, {
      decision,
      text: text ?? "",
    }),

  posts: () => get<Post[]>("/api/posts/"),
  publish: (body: string, targets: string[], media: string[] = []) =>
    post<{ id: number; results: { channel: string; success: boolean; error: string }[] }>(
      "/api/posts/",
      { body, target_channels: targets, media }
    ),

  analytics: (channel = "all") => get<Analytics>(`/api/analytics/?channel=${channel}`),

  subscription: () => get<Subscription>("/api/billing/subscription/"),
  checkout: (tier: string) => post<CheckoutResult>("/api/billing/checkout/", { tier }),
  simulatePayment: (payment_reference: string) =>
    post<{ handled: boolean; activated?: boolean; tier?: string }>(
      "/api/billing/simulate-payment/",
      { payment_reference }
    ),

  // -- settings --
  tenantSettings: () => get<TenantSettings>("/api/settings/tenant/"),
  saveTenantSettings: (body: Partial<TenantSettings>) =>
    patch<TenantSettings & { __status?: number }>("/api/settings/tenant/", body),
  saveNotifications: (notify_prefs: NotifyPrefs) =>
    patch<{ notify_prefs: NotifyPrefs }>("/api/settings/notifications/", { notify_prefs }),
  connectChannel: (channel: string) =>
    post<{ channel: string; connected: boolean }>(`/api/channels/${channel}/connect/`, {}),
  disconnectChannel: (channel: string) =>
    post<{ channel: string; connected: boolean }>(`/api/channels/${channel}/disconnect/`, {}),
  // Returns the provider's authorize URL; the caller navigates the browser
  // there directly (window.location.href) rather than fetching it — the
  // OAuth dance is a real cross-site redirect, not an API call.
  startOAuth: async (channel: string) => {
    const res = await fetch(`${BASE}/api/oauth/${channel}/start/`, {
      headers: { ...auth.authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      handleAuthFailure(res.status);
      return { __status: res.status, ...data } as { authorize_url?: string; error?: string; __status?: number };
    }
    return data as { authorize_url?: string; error?: string; __status?: number };
  },

  // -- account --
  updateProfile: (body: { name?: string; email?: string }) =>
    patch<{ user?: unknown; error?: string; __status?: number }>("/api/auth/profile/", body),
  changePassword: (current_password: string, new_password: string) =>
    post<{ status?: string; token?: string; error?: string; __status?: number }>(
      "/api/auth/password/change/",
      { current_password, new_password }
    ),
};

export interface NotifyPrefs {
  [event: string]: { in_app: boolean; email: boolean };
}

export interface TenantSettings {
  name: string;
  timezone: string;
  brand_voice: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
}
