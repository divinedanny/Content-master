"use client";

// Client-side durable outbox.
//
// When the owner sends a message it is written here (localStorage) FIRST and
// rendered optimistically, then POSTed to the server. If the device is offline
// or the request fails, the item stays and is retried automatically when the
// browser comes back online. The server keeps its own durable queue, so once a
// message is accepted (201) the client stops retrying — the server worker takes
// it the rest of the way to the platform. Idempotency is guaranteed by a stable
// client_id, so nothing is ever sent twice.

import type { ChannelKey } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const KEY = "cc_outbox_v1";

export type OutboxStatus = "queued" | "sending" | "sent" | "failed";

export interface OutboxItem {
  client_id: string;
  channel: ChannelKey;
  thread_id?: string;
  interaction_id?: number;
  recipient_handle?: string;
  recipient_display_name?: string;
  body: string;
  used_ai_draft?: boolean;
  status: OutboxStatus;
  server_status?: string;
  synced: boolean; // server accepted it (201); client stops retrying
  last_error?: string;
  created_at: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let items: OutboxItem[] = [];
let started = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function load() {
  if (!isBrowser()) return;
  try {
    items = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    items = [];
  }
}

function persist() {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

function newId(): string {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return "cid-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export const outbox = {
  isOnline(): boolean {
    return isBrowser() ? navigator.onLine : true;
  },

  getAll(): OutboxItem[] {
    return items;
  },

  forThread(thread_id?: string): OutboxItem[] {
    if (!thread_id) return [];
    return items.filter((i) => i.thread_id === thread_id && i.status !== "sent");
  },

  pendingCount(): number {
    return items.filter((i) => i.status === "queued" || i.status === "sending").length;
  },

  failedCount(): number {
    return items.filter((i) => i.status === "failed").length;
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Compose + queue a message. Returns the client_id. */
  send(input: {
    channel: ChannelKey;
    body: string;
    thread_id?: string;
    interaction_id?: number;
    recipient_handle?: string;
    recipient_display_name?: string;
    used_ai_draft?: boolean;
  }): string {
    const item: OutboxItem = {
      client_id: newId(),
      status: "queued",
      synced: false,
      created_at: new Date().toISOString(),
      ...input,
    };
    items = [...items, item];
    persist();
    void flushAll();
    return item.client_id;
  },

  retry(client_id: string) {
    items = items.map((i) =>
      i.client_id === client_id ? { ...i, status: "queued", synced: false, last_error: undefined } : i
    );
    persist();
    void flushAll();
  },

  discard(client_id: string) {
    items = items.filter((i) => i.client_id !== client_id);
    persist();
  },

  flush(): Promise<void> {
    return flushAll();
  },

  start() {
    if (started || !isBrowser()) return;
    started = true;
    load();
    window.addEventListener("online", () => void flushAll());
    window.addEventListener("offline", () => listeners.forEach((l) => l()));
    // periodic retry while anything is unsynced
    setInterval(() => {
      if (items.some((i) => !i.synced && i.status !== "failed")) void flushAll();
      pruneSent();
    }, 15000);
    void flushAll();
    listeners.forEach((l) => l());
  },
};

function pruneSent() {
  const cutoff = Date.now() - 8000;
  const next = items.filter(
    (i) => !(i.status === "sent" && new Date(i.created_at).getTime() < cutoff)
  );
  if (next.length !== items.length) {
    items = next;
    persist();
  }
}

let flushing = false;

async function flushAll(): Promise<void> {
  if (flushing || !isBrowser() || !navigator.onLine) return;
  flushing = true;
  try {
    for (const item of items.filter((i) => !i.synced && i.status !== "sent")) {
      await flushOne(item);
    }
  } finally {
    flushing = false;
  }
}

async function flushOne(item: OutboxItem) {
  update(item.client_id, { status: "sending" });
  try {
    const res = await fetch(`${BASE}/api/outbound/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: item.client_id,
        channel: item.channel,
        body: item.body,
        thread_id: item.thread_id,
        interaction_id: item.interaction_id,
        recipient_handle: item.recipient_handle,
        recipient_display_name: item.recipient_display_name,
        used_ai_draft: item.used_ai_draft,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Server accepted (durable now). Reflect its status; stop client retries.
    const serverStatus = data.status as string;
    update(item.client_id, {
      synced: true,
      server_status: serverStatus,
      status:
        serverStatus === "sent" ? "sent" : serverStatus === "failed" ? "failed" : "queued",
      last_error: data.last_error || undefined,
    });
  } catch {
    // Network/offline — leave it queued for the next attempt.
    update(item.client_id, { status: "queued" });
  }
}

function update(client_id: string, patch: Partial<OutboxItem>) {
  items = items.map((i) => (i.client_id === client_id ? { ...i, ...patch } : i));
  persist();
}
