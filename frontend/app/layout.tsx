import type { Metadata } from "next";
import "./globals.css";
import { Sidebar, MobileNav, Brand } from "@/components/Nav";
import { NotificationsBell } from "@/components/Notifications";
import { OutboxIndicator, ConnectionBanner } from "@/components/OutboxStatus";

export const metadata: Metadata = {
  title: "Command Centre — one inbox for every platform",
  description:
    "Attention-first unified social inbox for conversational-commerce businesses. Built by Dayne Core Technologies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* App top bar — brand on mobile, notifications + profile everywhere */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink-900/90 px-4 py-3 backdrop-blur">
              <div className="md:hidden">
                <Brand />
              </div>
              <div className="hidden text-sm text-slate-500 md:block">
                Good day, Avion Hub 👋
              </div>
              <div className="flex items-center gap-2.5">
                <OutboxIndicator />
                <NotificationsBell />
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-instagram text-sm font-bold text-white">
                  AH
                </div>
              </div>
            </header>
            <ConnectionBanner />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8 md:pt-8">
              {children}
            </main>
          </div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
