"""
MockAdapter — demo-mode implementation of the ChannelAdapter contract.

This is the strategy that makes a 24-hour build possible (TRD §4.2): it
implements the EXACT interface the production adapters will implement, so
swapping to live APIs changes adapter registration only — the ingestion,
triage, drafting, approval and send pipeline is untouched.

It also enforces the same real-world policy rules as production
(quiet hours, Meta's 24h reply window, LinkedIn's DM wall), so the demo
behaves honestly rather than pretending constraints don't exist.
"""

import uuid
from datetime import timedelta

from django.utils import timezone

from core.adapters.base import (
    PublishResult, SendDecision, SendResult, capability,
)
from core.models import Channel


class MockAdapter:
    """Serves seeded data. Same contract as MetaAdapter, XAdapter, etc."""

    def __init__(self, connection):
        self.connection = connection
        self.channel = connection.channel
        self.cap = capability(self.channel)

    # -- inbound ------------------------------------------------------------

    def verify_webhook(self, request) -> bool:
        return True

    def parse_inbound(self, payload) -> list:
        return []

    def poll(self, since_cursor=None) -> list:
        """Real adapters hit the network here. Demo data is pre-seeded."""
        return []

    # -- outbound -----------------------------------------------------------

    def can_send(self, interaction, policy=None) -> SendDecision:
        """
        Pre-send policy gate. Mirrors production rules exactly.

        Order matters: platform capability first (a hard wall), then
        platform reply window, then our own quiet hours.
        """
        # 1. Hard platform wall — LinkedIn offers no commercial DM API.
        if interaction.kind == "message" and not self.cap.supports_dm:
            return SendDecision(
                allowed=False,
                reason=(
                    f"{self.cap.label} does not provide message API access to "
                    f"third-party applications. Comments and mentions only."
                ),
            )

        # 2. Platform reply window (Meta's 24h customer-service window).
        if self.cap.reply_window_hours and interaction.kind == "message":
            age = timezone.now() - interaction.received_at
            if age > timedelta(hours=self.cap.reply_window_hours):
                return SendDecision(
                    allowed=False,
                    requires_template=True,
                    reason=(
                        f"Outside {self.cap.label}'s "
                        f"{self.cap.reply_window_hours}h reply window. "
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
            window = self.cap.reply_window_hours or 24
            is_reactive = (
                timezone.now() - interaction.received_at
            ) <= timedelta(hours=window)
            if not is_reactive:
                decision = policy.check_quiet_hours()
                if not decision.allowed:
                    return decision

        return SendDecision(allowed=True)

    def send_reply(self, interaction, text: str) -> SendResult:
        """
        In production this posts to the platform API and the reply lands in
        the customer's own native thread. Here it returns a synthetic id.
        """
        return SendResult(
            success=True,
            external_id=f"{self.channel}_out_{uuid.uuid4().hex[:12]}",
        )

    def publish(self, post) -> PublishResult:
        if not self.cap.supports_publish:
            return PublishResult(
                success=False,
                error=f"{self.cap.label} does not support publishing via API.",
            )
        # TikTok requires media; text-only posts are rejected by the platform.
        if self.channel == Channel.TIKTOK and not post.media:
            return PublishResult(
                success=False,
                error="TikTok requires media — text-only posts are not supported.",
            )
        return PublishResult(
            success=True,
            external_post_id=f"{self.channel}_post_{uuid.uuid4().hex[:10]}",
        )

    # -- measure ------------------------------------------------------------

    def fetch_analytics(self, since=None) -> list:
        return []

    # -- lifecycle ----------------------------------------------------------

    def refresh_token(self) -> None:
        return None
