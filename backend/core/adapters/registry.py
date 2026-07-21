"""
Adapter registry + compliance policy.

Swapping demo -> production is a change HERE and nowhere else. When Meta App
Review clears, register MetaAdapter for the Meta channels; the pipeline,
API and UI are untouched.
"""

from django.utils import timezone

from core.adapters.base import SendDecision
from core.adapters.mock import MockAdapter
from core.adapters.whatsapp import WhatsAppAdapter
from core.models import Channel


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


def get_adapter(connection):
    """Resolve the adapter for a channel connection."""
    if connection.is_mock:
        return MockAdapter(connection)
    adapter_cls = ADAPTER_REGISTRY.get(connection.channel)
    if adapter_cls is None:
        # No production adapter registered yet — fall back to mock so the
        # pipeline stays exercisable end-to-end.
        return MockAdapter(connection)
    return adapter_cls(connection)


def get_policy(tenant):
    return NGCompliancePolicy(tenant)
