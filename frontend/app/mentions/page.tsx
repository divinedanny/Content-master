"use client";

import { PageHeader } from "@/components/PageHeader";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import type { ChannelKey } from "@/lib/types";
import { mentionCounts } from "@/lib/counts";

// Channels that expose @mentions/tags via API. TikTok and WhatsApp do not.
const MENTION_CHANNELS: ChannelKey[] = ["instagram", "facebook", "linkedin", "x"];

export default function MentionsPage() {
  return (
    <div>
      <PageHeader
        title="Mentions"
        subtitle="Every time someone @mentions or tags the brand, across Instagram, Facebook, LinkedIn and X — a warm lead or a complaint you didn't know was happening."
      />
      <InboxWorkspace
        channels={MENTION_CHANNELS}
        negativeFirst
        resolveQuery={(tab) => ({ channel: tab, kind: "comment" })}
        // the comment feed also carries mentions/tags — keep only those here
        clientFilter={(i) => i.kind === "mention" || i.kind === "tag"}
        countLoader={() => mentionCounts(MENTION_CHANNELS)}
        emptyTitle="No mentions on this channel"
        emptyHint="When someone tags @avionhub, it lands here for a reply."
      />
    </div>
  );
}
