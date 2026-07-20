import type { ChannelKey } from "./types";

export interface ChannelMeta {
  key: ChannelKey;
  label: string;
  color: string; // brand hex, used for badges/accents
  short: string; // 2-letter fallback
}

// Order matches the tab strip described in the PRD.
export const CHANNELS: ChannelMeta[] = [
  { key: "whatsapp", label: "WhatsApp", color: "#25D366", short: "WA" },
  { key: "instagram", label: "Instagram", color: "#E1306C", short: "IG" },
  { key: "facebook", label: "Facebook", color: "#1877F2", short: "FB" },
  { key: "tiktok", label: "TikTok", color: "#ff2b56", short: "TT" },
  { key: "linkedin", label: "LinkedIn", color: "#0A66C2", short: "IN" },
  { key: "x", label: "X", color: "#e7e9ea", short: "X" },
  { key: "google", label: "Google Reviews", color: "#EA4335", short: "GR" },
];

export const CHANNEL_MAP: Record<ChannelKey, ChannelMeta> = CHANNELS.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<ChannelKey, ChannelMeta>
);

export function channelColor(key: ChannelKey): string {
  return CHANNEL_MAP[key]?.color ?? "#5b8cff";
}

export function channelLabel(key: ChannelKey): string {
  return CHANNEL_MAP[key]?.label ?? key;
}
