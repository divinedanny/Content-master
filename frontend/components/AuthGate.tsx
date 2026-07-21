"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { auth, type AuthUser } from "@/lib/auth";
import { AppShell } from "./AppShell";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

// Public routes render without the app chrome and never require a session.
// "/" is the public company/landing page; the app lives behind auth.
function isPublicRoute(pathname: string) {
  return pathname === "/" || AUTH_ROUTES.some((p) => pathname.startsWith(p));
}

// Gates the whole app: public routes render bare; everything else requires a
// signed-in user (redirect to /login otherwise).
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));
  const isPublic = isPublicRoute(pathname);

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

  // Redirect unauthenticated users off protected routes, and signed-in users
  // away from the auth pages (to the dashboard).
  useEffect(() => {
    if (!ready) return;
    if (!isPublic && !auth.getToken()) {
      router.replace("/login");
    }
    if (isAuthRoute && auth.getToken() && user) {
      router.replace("/dashboard");
    }
  }, [ready, isAuthRoute, isPublic, user, router]);

  // Public pages (landing + auth) render without the app chrome.
  if (isPublic) return <>{children}</>;

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
