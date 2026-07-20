// API response types — mirror the Django DRF contract exactly.

export type ChannelKey =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "x"
  | "google";

export type InteractionKind = "message" | "comment" | "mention" | "tag" | "review";
export type Sentiment = "positive" | "neutral" | "negative";
export type InteractionStatus =
  | "new"
  | "triaged"
  | "drafted"
  | "awaiting_approval"
  | "sent"
  | "dismissed";

export interface Draft {
  id: number;
  text: string;
  confidence: number;
  requires_escalation: boolean;
}

export interface Author {
  handle: string;
  display_name: string;
  initials: string;
}

export interface Interaction {
  id: number;
  channel: ChannelKey;
  channel_label: string;
  kind: InteractionKind;
  thread_id: string;
  permalink: string;
  author: Author;
  body: string;
  rating: number | null;
  received_at: string;
  waiting_seconds: number;
  waiting_label: string | null;
  sentiment: Sentiment;
  intent: string;
  priority: number;
  status: InteractionStatus;
  is_unanswered: boolean;
  first_response_seconds: number | null;
  first_response_label: string;
  draft: Draft | null;
}

export interface PerChannelAttention {
  channel: ChannelKey;
  label: string;
  unanswered: number;
  total: number;
  oldest_seconds: number;
  oldest_label: string;
  median_response_seconds: number | null;
  median_response_label: string;
  answered_within_5min_pct: number | null;
  answer_rate: number;
}

export interface Attention {
  total_unanswered: number;
  oldest_wait_seconds: number;
  oldest_wait_label: string;
  median_first_response_seconds: number | null;
  median_first_response_label: string;
  answered_within_5min_pct: number | null;
  most_neglected: PerChannelAttention | null;
  per_channel: PerChannelAttention[];
}

export interface ChannelInfo {
  channel: ChannelKey;
  label: string;
  connected: boolean;
  is_mock: boolean;
  handle: string;
  supports_dm: boolean;
  supports_comments: boolean;
  supports_publish: boolean;
  transport: "webhook" | "poll";
  reply_window_hours: number | null;
  constraint_note: string;
  gate: string;
  unanswered: number;
}

export interface SendPolicy {
  allowed: boolean;
  reason: string;
  requires_template: boolean;
}

export interface ThreadResponse {
  interaction: Interaction;
  messages: Interaction[];
  channel: {
    channel: ChannelKey;
    label: string;
    supports_dm: boolean;
    constraint_note: string;
  };
  send_policy: SendPolicy;
}

export interface ApproveResult {
  status?: string;
  sent_natively_to?: string;
  first_response_seconds?: number;
  first_response_label?: string;
  error?: string;
  requires_template?: boolean;
}

export interface TierLimits {
  channels: number;
  seats: number;
  ai_drafts: number | null;
}

export interface Tier {
  tier: string;
  label: string;
  price_ngn: number;
  limits: TierLimits;
}

export interface Subscription {
  tier: string;
  tier_label: string;
  status: string;
  status_label: string;
  is_entitled: boolean;
  amount_ngn: number;
  current_period_end: string | null;
  days_remaining: number | null;
  limits: TierLimits;
  payment_method: string;
  reserved_account_number: string;
  tiers: Tier[];
}

export interface CheckoutResult {
  payment_reference: string;
  checkout_url: string;
  amount_ngn: number;
  transaction_reference?: string;
  simulated: boolean;
}

export interface Publication {
  channel: ChannelKey;
  status: string;
  impressions: number;
  engagements: number;
  engagement_rate: number;
  error: string;
}

export interface Post {
  id: number;
  body: string;
  target_channels: ChannelKey[];
  published_at: string | null;
  status: string;
  total_impressions: number;
  total_engagements: number;
  publications: Publication[];
}

export interface Analytics {
  summary: Record<string, number>;
  timeseries: Record<string, { date: string; value: number }[]>;
  per_channel: { channel: ChannelKey; reach: number; count: number }[];
}
