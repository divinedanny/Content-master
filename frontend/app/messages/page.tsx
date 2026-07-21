"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import type { TabKey } from "@/components/TabStrip";
import type { ChannelKey } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { NewConversationButton } from "@/components/NewConversation";

const MESSAGE_CHANNELS: ChannelKey[] = [
  "whatsapp",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "x",
];

function MessagesInner() {
  const params = useSearchParams();
  const initial = (params.get("channel") as TabKey) || "all";
  const valid: TabKey[] = ["all", ...MESSAGE_CHANNELS];
  const initialTab = valid.includes(initial) ? initial : "all";

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Every platform's DMs in one list. Start, continue or reply to any conversation — the same interaction model everywhere."
      >
        <NewConversationButton />
      </PageHeader>
      <InboxWorkspace
        channels={MESSAGE_CHANNELS}
        initialTab={initialTab}
        suppressCountFor={["linkedin"]}
        resolveQuery={(tab) => ({
          channel: tab,
          kind: "message",
        })}
        emptyTitle="No messages on this channel"
        emptyHint="Switch tabs, or open the All tab to see every platform at once."
        describeEmpty={(tab, info) => {
          if (info && !info.supports_dm) {
            return {
              honest: true,
              title: `${info.label} does not provide a direct-message API to third-party apps`,
              hint: info.constraint_note,
            };
          }
          return null;
        }}
      />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading inbox…" />}>
      <MessagesInner />
    </Suspense>
  );
}
