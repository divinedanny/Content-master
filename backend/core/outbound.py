"""
Outbound message queue — the durable send pipeline.

The owner can start, continue or reply to a conversation on any connected
platform. Every human-composed message is persisted first (BR: nothing is
lost) and delivered by a worker with exponential backoff, so a message
survives flaky or absent network and goes out once the platform is reachable
again. Delivery is idempotent — a message is never sent twice.

Supervised autonomy is preserved: the AI only ever *suggests*; a message is
only queued because a human composed and sent it. Nothing here auto-sends.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.adapters.base import capability
from core.adapters.registry import get_adapter, get_policy
from core.models import (
    ChannelConnection, Interaction, InteractionKind, InteractionStatus,
    OutboundMessage, OutboundStatus, OUTBOUND_MAX_ATTEMPTS, OUTBOUND_TERMINAL,
    Subscription,
)

logger = logging.getLogger(__name__)


@dataclass
class _PolicyStub:
    """Minimal shape adapter.can_send() needs, for reply-window/quiet-hours."""
    kind: str
    received_at: object


def _backoff_seconds(attempts: int) -> int:
    """Exponential backoff, capped at 10 minutes."""
    return min(5 * (2 ** max(0, attempts - 1)), 600)


def _next_quiet_window_start(tenant):
    """When the tenant's send window next opens (for proactive sends held by
    quiet hours). Returns an aware datetime in UTC."""
    now_local = timezone.localtime(timezone.now())
    start_t = tenant.quiet_hours_start
    candidate = now_local.replace(
        hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0
    )
    if candidate <= now_local:
        candidate = candidate + timedelta(days=1)
    return candidate.astimezone(timezone.get_current_timezone()).astimezone()


@transaction.atomic
def enqueue(
    tenant,
    *,
    client_id: str,
    channel: str,
    body: str,
    thread_id: str = "",
    parent_interaction_id: int | None = None,
    recipient_handle: str = "",
    recipient_display_name: str = "",
    used_ai_draft: bool = False,
) -> OutboundMessage:
    """
    Accept a message into the queue. Idempotent on (tenant, client_id): a
    re-submission after a dropped connection returns the existing row.
    """
    existing = OutboundMessage.objects.filter(
        tenant=tenant, client_id=client_id
    ).first()
    if existing:
        return existing

    parent = None
    if parent_interaction_id:
        parent = Interaction.objects.filter(
            tenant=tenant, id=parent_interaction_id
        ).first()

    if not thread_id:
        if parent:
            thread_id = parent.thread_id
        else:
            thread_id = f"{channel}_out_{uuid.uuid4().hex[:12]}"

    return OutboundMessage.objects.create(
        tenant=tenant,
        client_id=client_id,
        channel=channel,
        thread_id=thread_id,
        parent_interaction=parent,
        recipient_handle=recipient_handle,
        recipient_display_name=recipient_display_name,
        body=body,
        used_ai_draft=used_ai_draft,
        status=OutboundStatus.QUEUED,
        next_attempt_at=timezone.now(),
    )


def _fail(msg: OutboundMessage, reason: str) -> OutboundMessage:
    msg.status = OutboundStatus.FAILED
    msg.last_error = reason
    msg.save(update_fields=["status", "last_error"])
    return msg


def attempt_send(msg: OutboundMessage) -> OutboundMessage:
    """
    Try to deliver one queued message exactly once.

    Network/transient failures reschedule with backoff (stay QUEUED until the
    attempt budget is exhausted). Policy blocks either fail fast (hard platform
    walls) or reschedule (quiet hours). Success writes the outbound Interaction
    into the thread so the conversation reads natively.
    """
    if msg.status in OUTBOUND_TERMINAL:
        return msg

    # Billing gate — a read-only subscription cannot send (BR-06). Not a
    # network problem, so we stop rather than retry forever.
    sub = Subscription.objects.filter(tenant=msg.tenant).first()
    if sub and not sub.is_entitled:
        return _fail(msg, "Subscription is read-only. Renew to send messages.")

    cap = capability(msg.channel)

    # Hard platform wall (e.g. LinkedIn has no commercial DM API).
    if not cap.supports_dm:
        return _fail(
            msg,
            f"{cap.label} does not provide a direct-message API to third-party "
            f"applications.",
        )

    connection = ChannelConnection.objects.filter(
        tenant=msg.tenant, channel=msg.channel
    ).first()
    if not connection:
        return _fail(msg, f"{cap.label} is not connected.")

    adapter = get_adapter(connection)
    policy = get_policy(msg.tenant)

    # Policy check. Replies ride the customer's reply window; brand-new
    # conversations are proactive and respect quiet hours (held, not failed).
    if msg.parent_interaction:
        stub = _PolicyStub(kind="message", received_at=msg.parent_interaction.received_at)
        decision = adapter.can_send(stub, policy)
        if not decision.allowed:
            if decision.requires_template:
                return _fail(msg, decision.reason)
            # quiet-hours style block on a reply — hold and retry
            msg.next_attempt_at = _next_quiet_window_start(msg.tenant)
            msg.last_error = decision.reason
            msg.save(update_fields=["next_attempt_at", "last_error"])
            return msg
    else:
        decision = policy.check_quiet_hours()
        if not decision.allowed:
            msg.next_attempt_at = _next_quiet_window_start(msg.tenant)
            msg.last_error = decision.reason
            msg.save(update_fields=["next_attempt_at", "last_error"])
            return msg

    # Deliver.
    msg.status = OutboundStatus.SENDING
    msg.save(update_fields=["status"])
    try:
        result = adapter.send_reply(msg.parent_interaction or msg, msg.body)
    except Exception as exc:  # network / adapter error — retryable
        logger.warning("Outbound send raised for %s: %s", msg.id, exc)
        result = None

    if result and result.success:
        return _mark_sent(msg, result.external_id)

    # Transient failure: backoff and retry, or give up after the budget.
    msg.attempts += 1
    msg.last_error = (result.error if result else "network error")
    if msg.attempts >= OUTBOUND_MAX_ATTEMPTS:
        msg.status = OutboundStatus.FAILED
    else:
        msg.status = OutboundStatus.QUEUED
        msg.next_attempt_at = timezone.now() + timedelta(
            seconds=_backoff_seconds(msg.attempts)
        )
    msg.save(update_fields=["attempts", "last_error", "status", "next_attempt_at"])
    return msg


@transaction.atomic
def _mark_sent(msg: OutboundMessage, external_id: str) -> OutboundMessage:
    now = timezone.now()

    interaction = Interaction.objects.create(
        tenant=msg.tenant,
        channel=msg.channel,
        external_id=external_id or f"{msg.channel}_out_{uuid.uuid4().hex[:12]}",
        kind=InteractionKind.MESSAGE,
        thread_id=msg.thread_id,
        author_handle="you",
        author_display_name="You",
        body=msg.body,
        received_at=now,
        status=InteractionStatus.SENT,
        is_outbound=True,
    )

    # First reply to a waiting customer closes the attention leak for them.
    parent = msg.parent_interaction
    if parent and parent.is_unanswered:
        parent.status = InteractionStatus.SENT
        parent.answered_at = now
        parent.first_response_seconds = int((now - parent.received_at).total_seconds())
        parent.save(update_fields=["status", "answered_at", "first_response_seconds"])

    msg.status = OutboundStatus.SENT
    msg.external_id = interaction.external_id
    msg.interaction = interaction
    msg.sent_at = now
    msg.save(update_fields=["status", "external_id", "interaction", "sent_at"])
    return msg


def process_due(tenant=None, limit: int = 200) -> dict:
    """
    Drain queued messages whose next_attempt_at has arrived. Called by the
    worker command and opportunistically when a client flushes its outbox.
    """
    qs = OutboundMessage.objects.filter(
        status=OutboundStatus.QUEUED, next_attempt_at__lte=timezone.now()
    )
    if tenant is not None:
        qs = qs.filter(tenant=tenant)

    sent = held = failed = 0
    for msg in qs.order_by("next_attempt_at")[:limit]:
        result = attempt_send(msg)
        if result.status == OutboundStatus.SENT:
            sent += 1
        elif result.status == OutboundStatus.FAILED:
            failed += 1
        else:
            held += 1
    return {"processed": sent + held + failed, "sent": sent, "held": held, "failed": failed}


def serialize_outbound(msg: OutboundMessage) -> dict:
    return {
        "id": msg.id,
        "client_id": msg.client_id,
        "channel": msg.channel,
        "thread_id": msg.thread_id,
        "body": msg.body,
        "status": msg.status,
        "attempts": msg.attempts,
        "last_error": msg.last_error,
        "used_ai_draft": msg.used_ai_draft,
        "is_pending": msg.is_pending,
        "recipient_handle": msg.recipient_handle,
        "recipient_display_name": msg.recipient_display_name,
        "created_at": msg.created_at.isoformat(),
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
    }
