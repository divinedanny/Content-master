"use client";

// Client-side auth: token + user in localStorage, a tiny pub/sub so the shell
// reacts, and the login/register/reset API calls. Tokens are signed bearer
// tokens from the backend, sent as Authorization: Bearer on every request.

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const TOKEN_KEY = "cc_auth_token";
const USER_KEY = "cc_auth_user";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  tenant: { id: number; name: string } | null;
  notify_prefs?: Record<string, { in_app: boolean; email: boolean }>;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function isBrowser() {
  return typeof window !== "undefined";
}

function notify() {
  listeners.forEach((l) => l());
}

export const auth = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getToken(): string | null {
    return isBrowser() ? localStorage.getItem(TOKEN_KEY) : null;
  },

  getUser(): AuthUser | null {
    if (!isBrowser()) return null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setSession(token: string, user: AuthUser) {
    if (!isBrowser()) return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notify();
  },

  setUser(user: AuthUser) {
    if (!isBrowser()) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notify();
  },

  clear() {
    if (!isBrowser()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    notify();
  },

  authHeader(): Record<string, string> {
    const t = this.getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  },

  // -- API --

  async login(email: string, password: string): Promise<AuthUser> {
    const { token, user } = await post("/api/auth/login/", { email, password });
    this.setSession(token, user);
    return user;
  },

  async register(name: string, email: string, password: string): Promise<AuthUser> {
    const { token, user } = await post("/api/auth/register/", { name, email, password });
    this.setSession(token, user);
    return user;
  },

  async requestReset(email: string): Promise<{ debug_reset_link?: string }> {
    return post("/api/auth/password/reset/", { email });
  },

  async confirmReset(uid: string, token: string, password: string): Promise<AuthUser> {
    const res = await post("/api/auth/password/reset/confirm/", { uid, token, password });
    this.setSession(res.token, res.user);
    return res.user;
  },

  async logout() {
    try {
      await post("/api/auth/logout/", {}, true);
    } catch {
      /* ignore */
    }
    this.clear();
  },

  async refresh(): Promise<AuthUser | null> {
    const t = this.getToken();
    if (!t) return null;
    try {
      const res = await fetch(`${BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      if (!res.ok) {
        this.clear();
        return null;
      }
      const { user } = await res.json();
      this.setUser(user);
      return user;
    } catch {
      return this.getUser();
    }
  },
};

async function post(path: string, body: unknown, authed = false) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authed ? auth.authHeader() : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
