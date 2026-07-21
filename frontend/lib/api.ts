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

// Default to same-origin ("") so requests go through the Next.js proxy
// (see next.config.mjs rewrites). This keeps the app on a single origin, which
// is what lets one exposed port serve the whole app to an external tester.
// Set NEXT_PUBLIC_API_BASE only to point the browser at a separate backend host.
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Return the parsed error body so callers can show the message (e.g. 409 policy)
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
};
