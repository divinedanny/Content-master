"""
WhatsAppAdapter — real WhatsApp Business Cloud API implementation of the
ChannelAdapter contract (see core/adapters/base.py).

Same shape as core/billing/monnify.py: an env-driven *Config class, a thin
*Client wrapping `requests`, and a module-level webhook-signature verifier.
Registered in core/adapters/registry.py's ADAPTER_REGISTRY — nothing above
the adapter layer (core/outbound.py, core/api/views.py) changes to use it.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime
from datetime import timezone as dt_timezone

import requests

from core.adapters.base import (
    NormalizedInteraction, PublishResult, SendDecision, SendResult,
    capability, check_send_policy,
)
from core.models import Channel

logger = logging.getLogger(__name__)


class WhatsAppConfig:
    """Environment-driven config. See .env.example for the WHATSAPP_* keys."""

    ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    WABA_ID = os.environ.get("WHATSAPP_WABA_ID", "")
    APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
    VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")
    GRAPH_API_VERSION = os.environ.get("WHATSAPP_GRAPH_API_VERSION", "v21.0")
    GRAPH_BASE_URL = "https://graph.facebook.com"

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.ACCESS_TOKEN and cls.PHONE_NUMBER_ID and cls.APP_SECRET)


class WhatsAppError(Exception):
    pass


# ---------------------------------------------------------------------------
# Webhook verification
# ---------------------------------------------------------------------------

def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Meta signs webhook POSTs with `X-Hub-Signature-256: sha256=<hex>`,
    HMAC-SHA256 keyed on the App Secret (not the access token).

    This is a different header, algorithm and prefix convention than
    Monnify's `monnify-signature` (raw hex, HMAC-SHA512, no prefix) — the two
    are not interchangeable, don't reuse one to check the other.
    """
    if not signature_header or not WhatsAppConfig.APP_SECRET:
        return False
    if not signature_header.startswith("sha256="):
        return False
    received = signature_header[len("sha256="):]
    expected = hmac.new(
        WhatsAppConfig.APP_SECRET.encode(), raw_body, hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, received)


# ---------------------------------------------------------------------------
# Graph API client
# ---------------------------------------------------------------------------

class WhatsAppClient:
    """Thin wrapper over the WhatsApp Business Cloud (Graph) API."""

    def __init__(self):
        self.cfg = WhatsAppConfig

    def _url(self, path: str) -> str:
        return f"{self.cfg.GRAPH_BASE_URL}/{self.cfg.GRAPH_API_VERSION}/{path}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.cfg.ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }

    def send_text_message(self, to: str, body: str) -> dict:
        """POST /{phone_number_id}/messages — free-form text reply."""
        if not self.cfg.is_configured():
            raise WhatsAppError(
                "WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN, "
                "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_APP_SECRET in .env"
            )
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }
        response = requests.post(
            self._url(f"{self.cfg.PHONE_NUMBER_ID}/messages"),
            json=payload, headers=self._headers(), timeout=20,
        )
        data = response.json() if response.content else {}
        if not response.ok:
            raise WhatsAppError(
                data.get("error", {}).get("message") or f"HTTP {response.status_code}"
            )
        return data


# ---------------------------------------------------------------------------
# Inbound payload parsing
# ---------------------------------------------------------------------------

def _extract_body(message: dict) -> str | None:
    """Best-effort text extraction across WhatsApp message types."""
    msg_type = message.get("type")
    if msg_type == "text":
        return message.get("text", {}).get("body", "")
    if msg_type in ("image", "video", "document", "audio", "sticker"):
        media = message.get(msg_type, {})
        return media.get("caption") or f"[{msg_type}]"
    if msg_type == "button":
        return message.get("button", {}).get("text", "")
    if msg_type == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return reply.get("title", "")
    return None  # unsupported type for v1 (reactions, location, contacts, ...)


def _parse_timestamp(raw) -> datetime:
    if not raw:
        return datetime.now(dt_timezone.utc)
    return datetime.fromtimestamp(int(raw), tz=dt_timezone.utc)


# ---------------------------------------------------------------------------
# The adapter
# ---------------------------------------------------------------------------

class WhatsAppAdapter:
    """Real implementation of ChannelAdapter for WhatsApp. Same contract as MockAdapter."""

    def __init__(self, connection):
        self.connection = connection
        self.channel = Channel.WHATSAPP
        self.cap = capability(self.channel)

    # -- inbound --------------------------------------------------------

    def verify_webhook(self, request) -> bool:
        """
        GET  -> Meta's subscription handshake (hub.mode / hub.verify_token).
        POST -> X-Hub-Signature-256 over the raw body.
        """
        if request.method == "GET":
            mode = request.GET.get("hub.mode")
            token = request.GET.get("hub.verify_token")
            return mode == "subscribe" and token == WhatsAppConfig.VERIFY_TOKEN
        signature = request.headers.get("X-Hub-Signature-256", "")
        return verify_webhook_signature(request.body, signature)

    def parse_inbound(self, payload) -> list[NormalizedInteraction]:
        """
        Walk entry[].changes[].value.{messages,contacts} into
        NormalizedInteraction rows. A `statuses[]`-only payload (delivery
        receipts) has no `messages` key and is skipped — not a new interaction.
        """
        out: list[NormalizedInteraction] = []
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages")
                if not messages:
                    continue

                names = {
                    c.get("wa_id"): c.get("profile", {}).get("name", "")
                    for c in value.get("contacts", [])
                }

                for message in messages:
                    body = _extract_body(message)
                    if body is None:
                        continue
                    wa_id = message.get("from", "")
                    out.append(NormalizedInteraction(
                        channel=Channel.WHATSAPP,
                        external_id=message.get("id", ""),
                        kind="message",
                        author_handle=wa_id,
                        author_display_name=names.get(wa_id, wa_id),
                        author_external_id=wa_id,
                        body=body,
                        received_at=_parse_timestamp(message.get("timestamp")),
                        thread_id=wa_id,
                    ))
        return out

    def poll(self, since_cursor=None) -> list:
        return []  # webhook-only (CAPABILITIES[WHATSAPP].transport == "webhook")

    # -- outbound -----------------------------------------------------------

    def can_send(self, interaction, policy=None) -> SendDecision:
        return check_send_policy(interaction, policy, self.cap)

    def send_reply(self, interaction, text: str) -> SendResult:
        to = getattr(interaction, "author_external_id", "") or getattr(interaction, "author_handle", "")
        try:
            result = WhatsAppClient().send_text_message(to=to, body=text)
        except (WhatsAppError, requests.RequestException) as exc:
            logger.warning("WhatsApp send failed: %s", exc)
            return SendResult(success=False, error=str(exc))
        message_id = (result.get("messages") or [{}])[0].get("id", "")
        return SendResult(success=True, external_id=message_id)

    def publish(self, post) -> PublishResult:
        return PublishResult(
            success=False,
            error=f"{self.cap.label} does not support publishing via API.",
        )

    # -- measure --------------------------------------------------------------

    def fetch_analytics(self, since=None) -> list:
        return []  # Graph Conversation Analytics — follow-up, not v1.

    # -- lifecycle --------------------------------------------------------------

    def refresh_token(self) -> None:
        """
        No-op. WHATSAPP_ACCESS_TOKEN is expected to be a long-lived Meta
        system-user token, which — unlike Monnify's hourly bearer token —
        does not expire on a short cycle. If a temporary (24h) user token is
        ever used here instead, this needs a real refresh flow; it doesn't
        have one.
        """
        return None
