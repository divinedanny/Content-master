"""
Adapter registry + compliance policy.

Swapping demo -> production is a change HERE and nowhere else. When Meta App
Review clears, register MetaAdapter for the Meta channels; the pipeline,
API and UI are untouched.
"""

import logging
import os

from django.utils import timezone

from core.adapters.base import SendDecision
from core.adapters.mock import MockAdapter
from core.adapters.whatsapp import WhatsAppAdapter, WhatsAppConfig
from core.models import Channel

logger = logging.getLogger(__name__)


class NGCompliancePolicy:
    """
    Nigerian outbound messaging policy (BR-03).

    Quiet hours default 08:00-20:00 WAT. Messages outside the window are
    queued, not sent — reused from the existing platform.
    """

    def __init__(self, tenant):
        self.tenant = tenant

    def check_quiet_hours(self) -> SendDecision:
        now_local = timezone.localtime(timezone.now())
        current = now_local.time()
        start = self.tenant.quiet_hours_start
        end = self.tenant.quiet_hours_end

        if start <= current <= end:
            return SendDecision(allowed=True)
        return SendDecision(
            allowed=False,
            reason=(
                f"Outside quiet hours ({start:%H:%M}-{end:%H:%M} "
                f"{self.tenant.timezone}). Message queued."
            ),
        )


#: Production adapters register here as their approvals land.
#: e.g. {Channel.INSTAGRAM: MetaAdapter, Channel.X: XAdapter}
ADAPTER_REGISTRY: dict = {
    Channel.WHATSAPP: WhatsAppAdapter,
}

#: Config objects (with an is_configured() classmethod) per channel. A channel
#: only goes live if its credentials are actually present.
ADAPTER_CONFIGS: dict = {
    Channel.WHATSAPP: WhatsAppConfig,
}


def _live_channels() -> set:
    """Channels the operator has switched to live via LIVE_CHANNELS in .env.

    Comma-separated channel keys, e.g. LIVE_CHANNELS=whatsapp,instagram.
    Empty (default) means every channel runs on the mock adapter.
    """
    raw = os.environ.get("LIVE_CHANNELS", "")
    return {c.strip().lower() for c in raw.split(",") if c.strip()}


def _configured(channel: str) -> bool:
    cfg = ADAPTER_CONFIGS.get(channel)
    return cfg is None or cfg.is_configured()


def is_live(channel: str) -> bool:
    """A channel is live only if it's opted in via .env, has a real adapter
    registered, and that adapter's credentials are configured."""
    return channel in _live_channels() and channel in ADAPTER_REGISTRY and _configured(channel)


def get_adapter(connection):
    """
    Resolve the adapter for a channel connection.

    Two ways a connection goes live:
      1. Per-tenant: the tenant completed a real connect flow (OAuth or
         WhatsApp Embedded Signup) and the row carries its own oauth_tokens
         — is_mock=False. That alone is enough, no .env flag needed.
      2. Global: LIVE_CHANNELS opts the whole deployment into one shared
         set of credentials from .env (a single WhatsApp test number, say).

    If a channel is opted in globally but its credentials aren't configured
    yet, it safely falls back to the mock adapter so the pipeline stays
    exercisable.
    """
    channel = connection.channel
    if channel in ADAPTER_REGISTRY and not connection.is_mock and connection.oauth_tokens:
        return ADAPTER_REGISTRY[channel](connection)
    if is_live(channel):
        return ADAPTER_REGISTRY[channel](connection)
    if channel in _live_channels() and not _configured(channel):
        logger.warning(
            "LIVE_CHANNELS includes %s but its credentials are incomplete — using mock.",
            channel,
        )
    return MockAdapter(connection)


def get_policy(tenant):
    return NGCompliancePolicy(tenant)
