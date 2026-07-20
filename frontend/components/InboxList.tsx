"use client";

import type { Interaction } from "@/lib/types";
import { channelColor } from "@/lib/channels";
import { ChannelBadge } from "./ChannelIcon";
import { StarRating } from "./ui";
import { timeAgo } from "@/lib/format";

export function InboxList({
  items,
  selectedId,
  onSelect,
}: {
  items: Interaction[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="divide-y divide-white/[0.04]">
      {items.map((i) => (
        <InboxRow
          key={i.id}
          item={i}
          selected={i.id === selectedId}
          onSelect={() => onSelect(i.id)}
        />
      ))}
    </div>
  );
}

function InboxRow({
  item,
  selected,
  onSelect,
}: {
  item: Interaction;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = channelColor(item.channel);
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
        selected ? "bg-accent/[0.10]" : "hover:bg-white/[0.02]"
      }`}
      style={selected ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
    >
      <ChannelBadge channel={item.channel} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-100">
            {item.author.display_name}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500">
            {item.is_unanswered ? item.waiting_label : timeAgo(item.received_at)}
          </span>
        </div>
        {item.rating != null && (
          <div className="mt-0.5">
            <StarRating rating={item.rating} />
          </div>
        )}
        <p className="mt-0.5 truncate text-sm text-slate-400">{item.body}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {item.is_unanswered ? (
            <span className="chip bg-rose-500/12 py-0.5 text-[10px] text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Waiting {item.waiting_label}
            </span>
          ) : (
            <span className="chip bg-emerald-500/12 py-0.5 text-[10px] text-emerald-300">
              Answered {item.first_response_label}
            </span>
          )}
          {item.draft && (
            <span className="chip bg-accent/12 py-0.5 text-[10px] text-accent-soft">
              Draft ready
            </span>
          )}
          {item.sentiment === "negative" && (
            <span className="chip bg-rose-500/12 py-0.5 text-[10px] text-rose-300">Negative</span>
          )}
        </div>
      </div>
    </button>
  );
}
