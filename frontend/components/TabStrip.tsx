"use client";

import type { ChannelKey } from "@/lib/types";
import { CHANNELS, channelColor } from "@/lib/channels";
import { ChannelIcon } from "./ChannelIcon";

export type TabKey = "all" | ChannelKey;

interface TabStripProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
  // which channels to show (defaults to all seven)
  channels?: ChannelKey[];
  // per-channel unanswered counts to render as badges
  counts?: Partial<Record<TabKey, number>>;
  showAll?: boolean;
}

export function TabStrip({
  active,
  onChange,
  channels,
  counts,
  showAll = true,
}: TabStripProps) {
  const list = channels
    ? CHANNELS.filter((c) => channels.includes(c.key))
    : CHANNELS;

  return (
    <div className="scrollbar-none -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
      {showAll && (
        <TabButton
          label="All"
          isActive={active === "all"}
          onClick={() => onChange("all")}
          count={counts?.all}
          color="#5b8cff"
          icon={<GridIcon />}
        />
      )}
      {list.map((c) => (
        <TabButton
          key={c.key}
          label={c.label}
          isActive={active === c.key}
          onClick={() => onChange(c.key)}
          count={counts?.[c.key]}
          color={channelColor(c.key)}
          icon={<ChannelIcon channel={c.key} className="h-3.5 w-3.5" />}
        />
      ))}
    </div>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
  count,
  color,
  icon,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
        isActive
          ? "border-transparent text-white"
          : "border-white/[0.06] text-slate-400 hover:border-white/10 hover:text-slate-200"
      }`}
      style={
        isActive
          ? { background: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}66` }
          : undefined
      }
    >
      <span style={{ color: isActive ? color : undefined }}>{icon}</span>
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none"
          style={{ background: `${color}33`, color }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  );
}
