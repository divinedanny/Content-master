import { api } from "./api";
import type { ChannelKey, Interaction } from "./types";
import type { TabKey } from "@/components/TabStrip";

function tally(
  items: Interaction[],
  channels: ChannelKey[],
  keep: (i: Interaction) => boolean
): Partial<Record<TabKey, number>> {
  const counts: Partial<Record<TabKey, number>> = {};
  let all = 0;
  for (const ch of channels) {
    const n = items.filter((i) => i.channel === ch && i.is_unanswered && keep(i)).length;
    counts[ch] = n;
    all += n;
  }
  counts.all = all;
  return counts;
}

// Mentions section: mentions/tags only, across comment-capable channels.
export async function mentionCounts(channels: ChannelKey[]) {
  const items = await api.inbox({ channel: "all", kind: "comment" });
  return tally(items, channels, (i) => i.kind === "mention" || i.kind === "tag");
}

// Comments section: pure comments per channel, plus reviews on the Google tab.
export async function commentCounts(commentChannels: ChannelKey[]) {
  const [comments, reviews] = await Promise.all([
    api.inbox({ channel: "all", kind: "comment" }),
    api.inbox({ channel: "all", kind: "review" }),
  ]);
  const counts = tally(comments, commentChannels, (i) => i.kind === "comment");
  const googleUnanswered = reviews.filter((i) => i.is_unanswered).length;
  counts.google = googleUnanswered;
  counts.all = (counts.all ?? 0) + googleUnanswered;
  return counts;
}
