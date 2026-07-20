"use client";

import { PageHeader } from "@/components/PageHeader";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import type { ChannelKey } from "@/lib/types";

const COMMENT_CHANNELS: ChannelKey[] = ["instagram", "facebook", "linkedin", "x", "google"];

export default function CommentsPage() {
  return (
    <div>
      <PageHeader
        title="Comments & Reviews"
        subtitle="Public comments, @mentions and Google Reviews — negative sentiment surfaced first, so the loudest unhappy customer never sits cold."
      />
      <InboxWorkspace
        channels={COMMENT_CHANNELS}
        negativeFirst
        resolveQuery={(tab) => {
          if (tab === "google") return { channel: "google", kind: "review" };
          if (tab === "all") return { channel: "all", kind: "comment" };
          return { channel: tab, kind: "comment" };
        }}
        emptyTitle="Nothing to moderate here"
        emptyHint="Google Reviews are polled on a schedule — Google provides no webhooks."
      />
    </div>
  );
}
