import type { Sentiment } from "@/lib/types";

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const map: Record<Sentiment, { label: string; cls: string; dot: string }> = {
    positive: {
      label: "Positive",
      cls: "bg-emerald-500/12 text-emerald-300",
      dot: "bg-emerald-400",
    },
    neutral: {
      label: "Neutral",
      cls: "bg-slate-500/12 text-slate-300",
      dot: "bg-slate-400",
    },
    negative: {
      label: "Negative",
      cls: "bg-rose-500/14 text-rose-300",
      dot: "bg-rose-400",
    },
  };
  const s = map[sentiment];
  return (
    <span className={`chip ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${i <= rating ? "text-amber-400" : "text-slate-600"}`}
          fill="currentColor"
        >
          <path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6L12 2Z" />
        </svg>
      ))}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#34d399" : pct >= 60 ? "#fbbf24" : "#fb7185";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      <span className="font-medium text-slate-300">{pct}%</span>
    </span>
  );
}

export function EscalationFlag() {
  return (
    <span className="chip bg-amber-500/14 text-amber-300">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M12 2 1 21h22L12 2Zm0 6 6.9 12H5.1L12 8Zm-1 4v3h2v-3h-2Zm0 4v2h2v-2h-2Z" />
      </svg>
      Needs escalation
    </span>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  pulse = false,
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-500/12 text-slate-300",
    good: "bg-emerald-500/14 text-emerald-300",
    warn: "bg-amber-500/14 text-amber-300",
    bad: "bg-rose-500/14 text-rose-300",
    accent: "bg-accent/16 text-accent-soft",
  };
  const dots: Record<string, string> = {
    neutral: "bg-slate-400",
    good: "bg-emerald-400",
    warn: "bg-amber-400",
    bad: "bg-rose-400",
    accent: "bg-accent",
  };
  return (
    <span className={`chip ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]} ${pulse ? "animate-pulseglow" : ""}`} />
      {label}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-slate-300">{title}</div>
      {hint && <div className="max-w-sm text-sm text-slate-500">{hint}</div>}
    </div>
  );
}
