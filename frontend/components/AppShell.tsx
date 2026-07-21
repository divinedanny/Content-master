"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar, MobileNav, Brand } from "@/components/Nav";
import { NotificationsBell } from "@/components/Notifications";
import { OutboxIndicator, ConnectionBanner } from "@/components/OutboxStatus";
import { auth, type AuthUser } from "@/lib/auth";

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink-900/90 px-4 py-3 backdrop-blur">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="hidden text-sm text-slate-500 md:block">
            Good day, {user.name.split(" ")[0]} 👋
          </div>
          <div className="flex items-center gap-2.5">
            <OutboxIndicator />
            <NotificationsBell />
            <ProfileMenu user={user} />
          </div>
        </header>
        <ConnectionBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8 md:pt-8">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function ProfileMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-instagram text-sm font-bold text-white ring-2 ring-transparent transition hover:ring-white/20"
        aria-label="Profile menu"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 animate-fade-up overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850/95 shadow-panel backdrop-blur">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <div className="truncate font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
            {user.tenant && (
              <div className="mt-1 text-[11px] text-slate-500">{user.tenant.name}</div>
            )}
          </div>
          <a
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.04] hover:text-white"
          >
            Account & settings
          </a>
          <button
            onClick={() => {
              auth.logout().finally(() => {
                window.location.href = "/";
              });
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
