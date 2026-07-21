"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <HomeIcon /> },
  { href: "/messages", label: "Messages", icon: <ChatIcon /> },
  { href: "/comments", label: "Comments", icon: <CommentIcon /> },
  { href: "/mentions", label: "Mentions", icon: <MentionIcon /> },
  { href: "/posts", label: "Posts", icon: <PostIcon /> },
  { href: "/analytics", label: "Analytics", icon: <ChartIcon /> },
  { href: "/settings", label: "Settings", icon: <GearIcon /> },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/70 px-4 py-5 backdrop-blur md:flex">
      <Brand />
      <nav className="mt-8 flex flex-col gap-1">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent/16 text-white shadow-[inset_0_0_0_1px_rgba(91,140,255,0.35)]"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              <span className={active ? "text-accent-soft" : "text-slate-500 group-hover:text-slate-300"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl border border-white/[0.06] bg-ink-850/70 p-3 text-xs text-slate-400">
        <div className="font-semibold text-slate-200">Avion Hub</div>
        <div className="mt-0.5">WhatsApp-native travel agency · Lagos</div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Tenant zero · demo data
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/[0.08] bg-ink-900/95 backdrop-blur md:hidden">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
              active ? "text-accent-soft" : "text-slate-500"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-instagram shadow-glow">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
          <path
            d="M12 3v18M3 12h18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight text-white">Command Centre</div>
        <div className="text-[11px] text-slate-500">Dayne Core Technologies</div>
      </div>
    </div>
  );
}

/* --- icons --- */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16v11H8l-4 4V5Z" strokeLinejoin="round" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" strokeLinejoin="round" />
    </svg>
  );
}
function MentionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" strokeLinecap="round" />
    </svg>
  );
}
function PostIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" strokeLinecap="round" />
    </svg>
  );
}
