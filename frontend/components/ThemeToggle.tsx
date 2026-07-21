"use client";

import { useEffect, useState } from "react";
import {
  effectiveTheme,
  setThemeChoice,
  subscribeTheme,
} from "@/lib/theme";

// Compact top-bar control: flips the *effective* theme. Whatever is showing
// now, one tap gives you the opposite — and pins that choice (so it stops
// following the device until you reset it to System in Settings).
export function ThemeToggle() {
  const [eff, setEff] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => setEff(effectiveTheme());
    sync();
    return subscribeTheme(sync);
  }, []);

  const next = eff === "dark" ? "light" : "dark";

  return (
    <button
      onClick={() => setThemeChoice(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-slate-300 transition hover:border-white/15 hover:text-white"
    >
      {eff === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 12.8A8 8 0 1 1 11.2 3a6 6 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
