"use client";

import { useEffect, useState } from "react";
import {
  getThemeChoice,
  getContrast,
  setThemeChoice,
  setContrast,
  subscribeTheme,
  type ThemeChoice,
  type Contrast,
} from "@/lib/theme";

export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [contrast, setContrastState] = useState<Contrast>("normal");

  useEffect(() => {
    const sync = () => {
      setTheme(getThemeChoice());
      setContrastState(getContrast());
    };
    sync();
    return subscribeTheme(sync);
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Appearance</h2>
        <p className="text-sm text-slate-500">
          Light by default, following your device. Override it here, or turn up the contrast.
        </p>
      </div>
      <div className="panel space-y-5 p-5">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Theme</div>
          <Segmented
            value={theme}
            onChange={(v) => setThemeChoice(v as ThemeChoice)}
            options={[
              { value: "system", label: "System", icon: <AutoIcon /> },
              { value: "light", label: "Light", icon: <SunIcon /> },
              { value: "dark", label: "Dark", icon: <MoonIcon /> },
            ]}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            System follows your device&apos;s light/dark setting automatically.
          </p>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Contrast</div>
          <Segmented
            value={contrast}
            onChange={(v) => setContrast(v as Contrast)}
            options={[
              { value: "normal", label: "Normal" },
              { value: "high", label: "High contrast" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              active
                ? "bg-accent text-[#fff] shadow-glow"
                : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.8A8 8 0 1 1 11.2 3a6 6 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
    </svg>
  );
}
function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
