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

from core.adapters.base import (
    PublishResult, SendDecision, SendResult, capability, check_send_policy,
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
        """Pre-send policy gate — shared with every real adapter, see base.check_send_policy."""
        return check_send_policy(interaction, policy, self.cap)

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
