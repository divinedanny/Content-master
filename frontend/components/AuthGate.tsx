"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { auth, type AuthUser } from "@/lib/auth";
import { AppShell } from "./AppShell";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

// Gates the whole app: auth routes render bare; everything else requires a
// signed-in user (redirect to /login otherwise).
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = auth.subscribe(() => setUser(auth.getUser()));
    // hydrate from storage, then validate against the server
    setUser(auth.getUser());
    auth.refresh().then((u) => {
      setUser(u);
      setReady(true);
    });
    return () => {
      unsub();
    };
  }, []);

  // Redirect unauthenticated users off protected routes.
  useEffect(() => {
    if (!ready) return;
    if (!isAuthRoute && !auth.getToken()) {
      router.replace("/login");
    }
    if (isAuthRoute && auth.getToken() && user) {
      router.replace("/");
    }
  }, [ready, isAuthRoute, user, router]);

  // Auth pages render without the app chrome.
  if (isAuthRoute) return <>{children}</>;

  // Protected pages: wait for the auth check, then render the shell.
  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </div>
    );
  }

  return <AppShell user={user}>{children}</AppShell>;
}
