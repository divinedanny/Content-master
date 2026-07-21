"""
Monnify integration (TRD §4.5).

Principles enforced here:
  - Server-side only. The secret key never reaches the client.
  - The WEBHOOK is the source of truth. We never grant access on the basis
    of a client-side "success" message (BR-04).
  - Idempotent. payment_reference is unique; duplicate webhooks are no-ops.
  - Hash-validated. Every webhook payload is verified before it is trusted.

Credentials come from environment variables — never hardcoded, so the repo
is safe to submit. See .env.example.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import uuid
from datetime import timedelta
from decimal import Decimal

import requests
from django.utils import timezone

logger = logging.getLogger(__name__)


class MonnifyConfig:
    """Environment-driven config. Sandbox by default."""

    BASE_URL = os.environ.get(
        "MONNIFY_BASE_URL", "https://sandbox.monnify.com"
    )
    API_KEY = os.environ.get("MONNIFY_API_KEY", "")
    SECRET_KEY = os.environ.get("MONNIFY_SECRET_KEY", "")
    CONTRACT_CODE = os.environ.get("MONNIFY_CONTRACT_CODE", "")
    REDIRECT_URL = os.environ.get(
        "MONNIFY_REDIRECT_URL", "http://localhost:3000/billing/callback"
    )

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.API_KEY and cls.SECRET_KEY and cls.CONTRACT_CODE)


class MonnifyError(Exception):
    pass


class MonnifyClient:
    """Thin, typed wrapper over the Monnify REST API."""

    def __init__(self):
        self.cfg = MonnifyConfig
        self._token = None
        self._token_expires_at = None

    # -- auth ---------------------------------------------------------------

    def _authenticate(self) -> str:
        """
        POST /api/v1/auth/login with Basic auth (base64 of apiKey:secretKey).
        Token is cached until shortly before expiry.
        """
        if not self.cfg.is_configured():
            raise MonnifyError(
                "Monnify is not configured. Set MONNIFY_API_KEY, "
                "MONNIFY_SECRET_KEY and MONNIFY_CONTRACT_CODE in .env"
            )

        credentials = f"{self.cfg.API_KEY}:{self.cfg.SECRET_KEY}"
        encoded = base64.b64encode(credentials.encode()).decode()

        response = requests.post(
            f"{self.cfg.BASE_URL}/api/v1/auth/login",
            headers={"Authorization": f"Basic {encoded}"},
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()

        if not body.get("requestSuccessful"):
            raise MonnifyError(f"Monnify auth failed: {body.get('responseMessage')}")

        payload = body["responseBody"]
        self._token = payload["accessToken"]
        # Refresh a minute early to avoid edge-of-expiry failures.
        self._token_expires_at = timezone.now() + timedelta(
            seconds=int(payload.get("expiresIn", 3600)) - 60
        )
        return self._token

    def _get_token(self) -> str:
        if self._token and self._token_expires_at and timezone.now() < self._token_expires_at:
            return self._token
        return self._authenticate()

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

    # -- collections --------------------------------------------------------

    def initialize_transaction(
        self,
        amount: Decimal,
        customer_name: str,
        customer_email: str,
        payment_reference: str,
        description: str,
        payment_methods: list[str] | None = None,
    ) -> dict:
        """
        POST /api/v1/merchant/transactions/init-transaction

        Returns {checkoutUrl, transactionReference, ...}. We redirect the
        user to checkoutUrl (or hand it to the Monnify inline SDK).
        """
        payload = {
            "amount": float(amount),
            "customerName": customer_name,
            "customerEmail": customer_email,
            "paymentReference": payment_reference,
            "paymentDescription": description,
            "currencyCode": "NGN",
            "contractCode": self.cfg.CONTRACT_CODE,
            "redirectUrl": self.cfg.REDIRECT_URL,
            "paymentMethods": payment_methods or ["CARD", "ACCOUNT_TRANSFER"],
        }

        response = requests.post(
            f"{self.cfg.BASE_URL}/api/v1/merchant/transactions/init-transaction",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()

        if not body.get("requestSuccessful"):
            raise MonnifyError(
                f"Transaction init failed: {body.get('responseMessage')}"
            )
        return body["responseBody"]

    def verify_transaction(self, payment_reference: str) -> dict:
        """
        GET /api/v1/merchant/transactions/query?paymentReference=...

        Belt-and-braces server-side confirmation before granting access,
        even after a valid webhook.
        """
        response = requests.get(
            f"{self.cfg.BASE_URL}/api/v1/merchant/transactions/query",
            params={"paymentReference": payment_reference},
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()

        if not body.get("requestSuccessful"):
            raise MonnifyError(
                f"Verification failed: {body.get('responseMessage')}"
            )
        return body["responseBody"]

    def create_reserved_account(
        self, account_reference: str, account_name: str,
        customer_email: str, customer_name: str, bvn: str = "",
    ) -> dict:
        """
        Permanent virtual account for bank-transfer subscription payment.

        Important for the Nigerian SME market: a large share of businesses
        prefer transfer to card. Card-only billing silently excludes them.
        """
        payload = {
            "accountReference": account_reference,
            "accountName": account_name,
            "currencyCode": "NGN",
            "contractCode": self.cfg.CONTRACT_CODE,
            "customerEmail": customer_email,
            "customerName": customer_name,
            "getAllAvailableBanks": True,
        }
        if bvn:
            payload["bvn"] = bvn

        response = requests.post(
            f"{self.cfg.BASE_URL}/api/v2/bank-transfer/reserved-accounts",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()

        if not body.get("requestSuccessful"):
            raise MonnifyError(
                f"Reserved account creation failed: {body.get('responseMessage')}"
            )
        return body["responseBody"]

    def charge_card_token(
        self, card_token: str, amount: Decimal,
        customer_email: str, customer_name: str, payment_reference: str,
    ) -> dict:
        """Recurring subscription charge against a stored card token."""
        payload = {
            "cardToken": card_token,
            "amount": float(amount),
            "customerName": customer_name,
            "customerEmail": customer_email,
            "paymentReference": payment_reference,
            "contractCode": self.cfg.CONTRACT_CODE,
            "currencyCode": "NGN",
            "apiKey": self.cfg.API_KEY,
        }
        response = requests.post(
            f"{self.cfg.BASE_URL}/api/v1/merchant/cards/charge-card-token",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("responseBody", {})


# ---------------------------------------------------------------------------
# Webhook verification
# ---------------------------------------------------------------------------

def compute_transaction_hash(raw_body: bytes) -> str:
    """
    Monnify signs webhooks with SHA-512 HMAC of the raw request body,
    keyed on the merchant secret key, delivered in the monnify-signature
    header. We compare against the RAW bytes — re-serializing the JSON
    would change whitespace and break the comparison.
    """
    return hmac.new(
        MonnifyConfig.SECRET_KEY.encode(),
        raw_body,
        hashlib.sha512,
    ).hexdigest()


def verify_webhook_signature(raw_body: bytes, received_signature: str) -> bool:
    """Constant-time comparison to avoid timing attacks."""
    if not received_signature or not MonnifyConfig.SECRET_KEY:
        return False
    expected = compute_transaction_hash(raw_body)
    return hmac.compare_digest(expected, received_signature)


def generate_payment_reference(tenant_slug: str) -> str:
    """
    Unique per ATTEMPT (BR-05). Reusing a reference is one of the most
    common causes of failed Monnify calls, and it is also our idempotency
    key — so uniqueness is enforced by a DB constraint too.
    """
    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    return f"CC-{tenant_slug}-{stamp}-{uuid.uuid4().hex[:8]}".upper()
