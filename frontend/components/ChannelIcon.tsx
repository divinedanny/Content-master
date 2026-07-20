import type { ChannelKey } from "@/lib/types";
import { channelColor } from "@/lib/channels";

// Simplified brand glyphs. Each renders on a `currentColor` fill so the badge
// wrapper controls color.
const PATHS: Record<ChannelKey, React.ReactNode> = {
  whatsapp: (
    <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.9-2.7-1.2-4.4-4-4.5-4.2-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.2.1.6-.1 1.2Z" />
  ),
  instagram: (
    <path d="M12 7.3A4.7 4.7 0 1 0 16.7 12 4.7 4.7 0 0 0 12 7.3Zm0 7.7A3 3 0 1 1 15 12a3 3 0 0 1-3 3Zm4.9-7.9a1.1 1.1 0 1 1-1.1-1.1 1.1 1.1 0 0 1 1.1 1.1ZM20.5 8a5.4 5.4 0 0 0-1.5-3.9A5.4 5.4 0 0 0 15.1 2.6C13.6 2.5 12 2.5 12 2.5s-1.6 0-3.1.1A5.4 5.4 0 0 0 5 4.1 5.4 5.4 0 0 0 3.5 8C3.4 9.5 3.4 12 3.4 12s0 2.5.1 4a5.4 5.4 0 0 0 1.5 3.9 5.4 5.4 0 0 0 3.9 1.5c1.5.1 3.1.1 3.1.1s1.6 0 3.1-.1a5.4 5.4 0 0 0 3.9-1.5 5.4 5.4 0 0 0 1.5-3.9c.1-1.5.1-4 .1-4s0-2.5-.1-4Zm-2 8a3 3 0 0 1-1.7 1.7c-1.2.5-3.9.4-5.2.4s-4 .1-5.2-.4A3 3 0 0 1 4.7 16c-.5-1.2-.4-3.9-.4-5.2s-.1-4 .4-5.2A3 3 0 0 1 6.4 3.9c1.2-.5 3.9-.4 5.2-.4s4-.1 5.2.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 3.9.4 5.2s.1 4-.4 5.2Z" />
  ),
  facebook: (
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />
  ),
  tiktok: (
    <path d="M16.5 2h-3v13.5a2.5 2.5 0 1 1-2.5-2.5c.2 0 .4 0 .6.1V9.8a5.9 5.9 0 0 0-.6 0 5.7 5.7 0 1 0 5.7 5.7V8.9a7.3 7.3 0 0 0 4.3 1.4V7a4.3 4.3 0 0 1-4-4.9V2Z" />
  ),
  linkedin: (
    <path d="M20.4 3H3.6A.6.6 0 0 0 3 3.6v16.8a.6.6 0 0 0 .6.6h16.8a.6.6 0 0 0 .6-.6V3.6a.6.6 0 0 0-.6-.6ZM8.3 18.3H5.6V9.8h2.7v8.5ZM7 8.6a1.5 1.5 0 1 1 0-3.1 1.5 1.5 0 0 1 0 3.1Zm11.3 9.7h-2.7v-4.1c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.2H9.9V9.8h2.6v1.2h.1a2.9 2.9 0 0 1 2.6-1.4c2.8 0 3.3 1.8 3.3 4.2v4.5Z" />
  ),
  x: (
    <path d="M17.5 3h3l-6.6 7.5L21.7 21h-5.9l-4.6-6-5.3 6H2.9l7-8L2.6 3h6l4.2 5.5L17.5 3Zm-1 16h1.7L7.6 4.7H5.8L16.5 19Z" />
  ),
  google: (
    <path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6L12 2Z" />
  ),
};

export function ChannelIcon({
  channel,
  className = "h-4 w-4",
}: {
  channel: ChannelKey;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {PATHS[channel]}
    </svg>
  );
}

export function ChannelBadge({
  channel,
  size = 32,
  ring = false,
}: {
  channel: ChannelKey;
  size?: number;
  ring?: boolean;
}) {
  const color = channelColor(channel);
  const iconSize = Math.round(size * 0.54);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${
        ring ? "ring-2 ring-white/10" : ""
      }`}
      style={{
        width: size,
        height: size,
        background: `${color}1f`,
        color,
        boxShadow: `inset 0 0 0 1px ${color}44`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ width: iconSize, height: iconSize }}
        aria-hidden
      >
        {PATHS[channel]}
      </svg>
    </span>
  );
}
