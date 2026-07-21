"""
Channel adapter contract (TRD §4.3).

Every platform — real or mocked — implements this interface. The core
pipeline never learns platform specifics; it only ever sees an Interaction.

This is the same discipline as the supplier adapters (Duffel/Tiqwa) in the
travel platform: swap the implementation, the pipeline is untouched.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Protocol

from django.utils import timezone

from core.models import Channel


# ---------------------------------------------------------------------------
# Capability matrix — encodes REAL platform constraints (TRD §4.4)
#
# These are not arbitrary product choices. They reflect what each platform's
# API actually permits as of July 2026, and they drive what the UI offers.
# Re-verify before production build; these rules change often.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ChannelCapability:
    channel: str
    label: str
    supports_dm: bool
    supports_comments: bool
    supports_publish: bool
    supports_analytics: bool
    transport: str                 # "webhook" | "poll"
    reply_window_hours: int | None  # None = no platform-imposed window
    constraint_note: str = ""
    gate: str = ""                  # what blocks production access


CAPABILITIES: dict[str, ChannelCapability] = {
    Channel.WHATSAPP: ChannelCapability(
        channel=Channel.WHATSAPP, label="WhatsApp",
        supports_dm=True, supports_comments=False,
        supports_publish=False, supports_analytics=True,
        transport="webhook", reply_window_hours=24,
        constraint_note=(
            "Free-form replies allowed for 24h after the customer's last "
            "message. Outside that window, approved templates only."
        ),
        gate="Meta App Review + WhatsApp template approval.",
    ),
    Channel.INSTAGRAM: ChannelCapability(
        channel=Channel.INSTAGRAM, label="Instagram",
        supports_dm=True, supports_comments=True,
        supports_publish=True, supports_analytics=True,
        transport="webhook", reply_window_hours=24,
        constraint_note="DMs, comments, @mentions and tags. ~200 API calls/hr/account.",
        gate="Meta App Review (instagram_manage_messages, instagram_manage_comments); Business/Creator account.",
    ),
    Channel.FACEBOOK: ChannelCapability(
        channel=Channel.FACEBOOK, label="Facebook",
        supports_dm=True, supports_comments=True,
        supports_publish=True, supports_analytics=True,
        transport="webhook", reply_window_hours=24,
        constraint_note="Page comments and Messenger DMs.",
        gate="Meta App Review; Page Public Content Access for full feed reads.",
    ),
    Channel.TIKTOK: ChannelCapability(
        channel=Channel.TIKTOK, label="TikTok",
        supports_dm=True, supports_comments=False,
        supports_publish=True, supports_analytics=True,
        transport="webhook", reply_window_hours=None,
        constraint_note=(
            "Business DMs only — TikTok does not expose comment "
            "reading/moderation via API. Publishing requires media; "
            "text-only posts are not supported."
        ),
        gate="Business Messaging API special approval; Business account; "
             "unavailable for EEA/Switzerland/UK-registered accounts (Nigeria OK).",
    ),
    Channel.LINKEDIN: ChannelCapability(
        channel=Channel.LINKEDIN, label="LinkedIn",
        supports_dm=False,          # <-- hard platform wall, not our choice
        supports_comments=True,
        supports_publish=True, supports_analytics=True,
        transport="webhook", reply_window_hours=None,
        constraint_note=(
            "Page comments and @mentions only. LinkedIn does NOT provide "
            "messaging/InMail API access to commercial third-party apps. "
            "Member profile data must be purged after 24h, activity after 48h."
        ),
        gate="Community Management API Standard tier — registered legal org, "
             "business verification, screencast review.",
    ),
    Channel.X: ChannelCapability(
        channel=Channel.X, label="X",
        supports_dm=True, supports_comments=True,
        supports_publish=True, supports_analytics=True,
        transport="webhook", reply_window_hours=None,
        constraint_note=(
            "Pay-per-use only — no free tier for new developers. "
            "~$0.005/read, $0.015/write, $0.20 per post containing a URL."
        ),
        gate="Cost, not approval. Legacy Basic/Pro closed to new signups; "
             "only pay-per-use or Enterprise (~$42k/mo).",
    ),
    Channel.GOOGLE: ChannelCapability(
        channel=Channel.GOOGLE, label="Google Reviews",
        supports_dm=False, supports_comments=True,
        supports_publish=False, supports_analytics=False,
        transport="poll",           # <-- no webhooks exist for GBP reviews
        reply_window_hours=None,
        constraint_note=(
            "Reviews are polled on a schedule — Google provides no webhooks. "
            "Owner replies only; fake/incentivised reviews violate policy."
        ),
        gate="GBP API access request — verified profile active 60+ days, "
             "business website, use-case form. Approval takes days to weeks.",
    ),
}


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------

@dataclass
class NormalizedInteraction:
    """Platform-agnostic inbound event, ready for upsert into Interaction."""
    channel: str
    external_id: str
    kind: str
    author_handle: str
    author_display_name: str
    body: str
    received_at: object
    thread_id: str = ""
    parent_ref: str = ""
    permalink: str = ""
    author_external_id: str = ""
    author_avatar_url: str = ""
    media: list = field(default_factory=list)
    rating: int | None = None
    is_outbound: bool = False


@dataclass
class SendDecision:
    """Result of pre-send policy checks (quiet hours, reply window, limits)."""
    allowed: bool
    reason: str = ""
    requires_template: bool = False


@dataclass
class SendResult:
    success: bool
    external_id: str = ""
    error: str = ""


@dataclass
class PublishResult:
    success: bool
    external_post_id: str = ""
    error: str = ""


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------

class ChannelAdapter(Protocol):
    """Implemented by MockAdapter now, and by MetaAdapter et al. in production."""

    channel: str

    # inbound
    def verify_webhook(self, request) -> bool: ...
    def parse_inbound(self, payload) -> list[NormalizedInteraction]: ...
    def poll(self, since_cursor) -> list[NormalizedInteraction]: ...

    # outbound
    def can_send(self, interaction, policy) -> SendDecision: ...
    def send_reply(self, interaction, text: str) -> SendResult: ...
    def publish(self, post) -> PublishResult: ...

    # measure
    def fetch_analytics(self, since) -> list[dict]: ...

    # lifecycle
    def refresh_token(self) -> None: ...


def capability(channel: str) -> ChannelCapability:
    return CAPABILITIES[channel]


# ---------------------------------------------------------------------------
# Shared send-policy check — real platform constraints (TRD §4.4) plus our
# own quiet hours (BR-03). Every adapter, mock or real, evaluates the same
# rules here so "what WhatsApp actually allows" has exactly one definition.
# ---------------------------------------------------------------------------

def check_send_policy(interaction, policy, cap: ChannelCapability) -> SendDecision:
    """
    Pre-send policy gate, shared by MockAdapter and every real adapter.

    Order matters: platform capability first (a hard wall), then platform
    reply window, then our own quiet hours.
    """
    # 1. Hard platform wall — e.g. LinkedIn offers no commercial DM API.
    if interaction.kind == "message" and not cap.supports_dm:
        return SendDecision(
            allowed=False,
            reason=(
                f"{cap.label} does not provide message API access to "
                f"third-party applications. Comments and mentions only."
            ),
        )

    # 2. Platform reply window (e.g. Meta's 24h customer-service window).
    if cap.reply_window_hours and interaction.kind == "message":
        age = timezone.now() - interaction.received_at
        if age > timedelta(hours=cap.reply_window_hours):
            return SendDecision(
                allowed=False,
                requires_template=True,
                reason=(
                    f"Outside {cap.label}'s "
                    f"{cap.reply_window_hours}h reply window. "
                    f"An approved template is required."
                ),
            )

    # 3. Our own quiet hours (BR-03).
    #
    # Deliberately scoped to PROACTIVE outbound only. Quiet hours exist to
    # stop businesses pushing marketing at night — not to stop them
    # answering a customer who just asked a question. Replying to a live
    # enquiry at 23:00 is good service; blocking it would manufacture the
    # very attention leak this product exists to remove.
    #
    # A reply is "reactive" if we are still inside the platform's reply
    # window, i.e. the customer contacted us recently.
    if policy and interaction.kind == "message":
        window = cap.reply_window_hours or 24
        is_reactive = (timezone.now() - interaction.received_at) <= timedelta(hours=window)
        if not is_reactive:
            decision = policy.check_quiet_hours()
            if not decision.allowed:
                return decision

    return SendDecision(allowed=True)
