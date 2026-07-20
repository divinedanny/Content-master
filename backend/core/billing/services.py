"""
Subscription lifecycle (TRD §4.5, BRD §2.3).

Subscription state changes here and ONLY here, driven by verified Monnify
events. The rest of the application reads Subscription.status.
"""

import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.billing.monnify import (
    MonnifyClient, MonnifyConfig, MonnifyError, generate_payment_reference,
)
from core.models import (
    PaymentStatus, PaymentTransaction, Subscription, SubscriptionStatus,
    SubscriptionTier, TIER_PRICING_NGN,
)

logger = logging.getLogger(__name__)


class SubscriptionService:

    def __init__(self, tenant):
        self.tenant = tenant
        self.subscription, _ = Subscription.objects.get_or_create(
            tenant=tenant,
            defaults={
                "tier": SubscriptionTier.STARTER,
                "status": SubscriptionStatus.TRIAL,
                "current_period_start": timezone.now(),
                "current_period_end": timezone.now() + timedelta(days=14),
            },
        )

    # -- checkout -----------------------------------------------------------

    def initiate_checkout(
        self, tier: str, customer_name: str, customer_email: str,
        payment_methods: list[str] | None = None,
    ) -> dict:
        """
        Create a PaymentTransaction, then ask Monnify for a checkoutUrl.

        The local row is created FIRST so that even if the network call
        fails we retain an auditable record of the attempt.
        """
        amount = Decimal(TIER_PRICING_NGN[tier])
        reference = generate_payment_reference(self.tenant.slug)

        txn = PaymentTransaction.objects.create(
            tenant=self.tenant,
            payment_reference=reference,
            tier=tier,
            amount_ngn=amount,
            status=PaymentStatus.PENDING,
        )

        description = f"Command Centre — {tier.title()} (monthly)"

        # Demo fallback: if sandbox credentials aren't loaded, return a
        # simulated checkout so the flow stays demonstrable. Clearly flagged.
        if not MonnifyConfig.is_configured():
            logger.warning("Monnify not configured — returning simulated checkout.")
            txn.checkout_url = f"/billing/simulated-checkout?ref={reference}"
            txn.save(update_fields=["checkout_url"])
            return {
                "payment_reference": reference,
                "checkout_url": txn.checkout_url,
                "amount_ngn": float(amount),
                "simulated": True,
            }

        try:
            result = MonnifyClient().initialize_transaction(
                amount=amount,
                customer_name=customer_name,
                customer_email=customer_email,
                payment_reference=reference,
                description=description,
                payment_methods=payment_methods,
            )
        except (MonnifyError, Exception) as exc:
            txn.status = PaymentStatus.FAILED
            txn.raw_payload = {"error": str(exc)}
            txn.save(update_fields=["status", "raw_payload"])
            raise

        txn.checkout_url = result.get("checkoutUrl", "")
        txn.monnify_transaction_reference = result.get("transactionReference", "")
        txn.save(update_fields=["checkout_url", "monnify_transaction_reference"])

        return {
            "payment_reference": reference,
            "checkout_url": txn.checkout_url,
            "transaction_reference": txn.monnify_transaction_reference,
            "amount_ngn": float(amount),
            "simulated": False,
        }

    # -- activation ---------------------------------------------------------

    @transaction.atomic
    def activate(self, txn: PaymentTransaction) -> Subscription:
        """Grant entitlement. Called only after a payment is verified paid."""
        now = timezone.now()
        sub = self.subscription
        sub.tier = txn.tier
        sub.status = SubscriptionStatus.ACTIVE
        sub.amount_ngn = txn.amount_ngn
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=30)
        if txn.payment_method:
            sub.payment_method = txn.payment_method
        sub.save()
        logger.info("Activated %s for tenant %s", txn.tier, self.tenant.slug)
        return sub


@transaction.atomic
def process_transaction_webhook(payload: dict) -> dict:
    """
    Handle a verified Monnify Transaction Completion webhook.

    Idempotency (BR-05): we look up the PaymentTransaction by our own
    payment_reference and short-circuit if it is already terminal. Monnify
    may legitimately deliver the same notification more than once.

    The caller MUST have already validated the signature and returned 200
    before invoking this.
    """
    event_data = payload.get("eventData", payload)
    reference = event_data.get("paymentReference")
    payment_status = (event_data.get("paymentStatus") or "").upper()

    if not reference:
        return {"handled": False, "reason": "missing paymentReference"}

    try:
        txn = PaymentTransaction.objects.select_for_update().get(
            payment_reference=reference
        )
    except PaymentTransaction.DoesNotExist:
        logger.warning("Webhook for unknown reference %s", reference)
        return {"handled": False, "reason": "unknown reference"}

    # --- idempotency gate ---
    if txn.status in (PaymentStatus.PAID, PaymentStatus.REFUNDED):
        return {"handled": True, "duplicate": True, "reference": reference}

    txn.webhook_received_at = timezone.now()
    txn.raw_payload = payload
    txn.monnify_transaction_reference = (
        event_data.get("transactionReference") or txn.monnify_transaction_reference
    )
    txn.payment_method = event_data.get("paymentMethod", "")

    if payment_status == "PAID":
        txn.status = PaymentStatus.PAID
        txn.completed_at = timezone.now()
        txn.save()

        service = SubscriptionService(txn.tenant)
        service.activate(txn)
        return {
            "handled": True,
            "activated": True,
            "reference": reference,
            "tier": txn.tier,
        }

    txn.status = PaymentStatus.FAILED
    txn.save()
    return {"handled": True, "activated": False, "reference": reference}


def apply_dunning(subscription: Subscription) -> Subscription:
    """
    Failed renewal path (BR-06): past_due -> grace -> read_only.
    Data is never deleted; we never hold a business's conversations hostage.
    """
    if subscription.status == SubscriptionStatus.ACTIVE:
        subscription.status = SubscriptionStatus.PAST_DUE
    elif subscription.status == SubscriptionStatus.PAST_DUE:
        subscription.status = SubscriptionStatus.GRACE
    elif subscription.status == SubscriptionStatus.GRACE:
        subscription.status = SubscriptionStatus.READ_ONLY
    subscription.save(update_fields=["status", "updated_at"])
    return subscription
