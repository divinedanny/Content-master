"use client";

import { PageHeader } from "@/components/PageHeader";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import type { ChannelKey } from "@/lib/types";
import { commentCounts } from "@/lib/counts";

const COMMENT_CHANNELS: ChannelKey[] = ["instagram", "facebook", "linkedin", "x", "google"];
const PURE_COMMENT_CHANNELS: ChannelKey[] = ["instagram", "facebook", "linkedin", "x"];

export default function CommentsPage() {
  return (
    <div>
      <PageHeader
        title="Comments & Reviews"
        subtitle="Public comments and Google Reviews — negative sentiment surfaced first, so the loudest unhappy customer never sits cold. @mentions have their own section."
      />
      <InboxWorkspace
        channels={COMMENT_CHANNELS}
        negativeFirst
        resolveQuery={(tab) => {
          if (tab === "google") return { channel: "google", kind: "review" };
          if (tab === "all") return { channel: "all", kind: "comment" };
          return { channel: tab, kind: "comment" };
        }}
        // keep pure comments and reviews here; mentions/tags live under Mentions
        clientFilter={(i) => i.kind === "comment" || i.kind === "review"}
        countLoader={() => commentCounts(PURE_COMMENT_CHANNELS)}
        emptyTitle="Nothing to moderate here"
        emptyHint="Comments and reviews you've answered drop off this list."
      />
    </div>
  );
}
