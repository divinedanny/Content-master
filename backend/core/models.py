"""
Command Centre — core data models.

Implements the DRD (document set §5). Every tenant-owned model inherits
TenantScopedModel; isolation is enforced at the queryset layer (BR-07).

Key invariants:
  - Interaction:        UNIQUE(channel, external_id)   -> ingestion dedupe
  - PaymentTransaction: UNIQUE(payment_reference)      -> Monnify idempotency
  - All timestamps stored UTC, rendered in tenant timezone (Africa/Lagos)
"""

from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Choice sets
# ---------------------------------------------------------------------------

class Channel(models.TextChoices):
    WHATSAPP = "whatsapp", "WhatsApp"
    INSTAGRAM = "instagram", "Instagram"
    FACEBOOK = "facebook", "Facebook"
    TIKTOK = "tiktok", "TikTok"
    LINKEDIN = "linkedin", "LinkedIn"
    X = "x", "X"
    GOOGLE = "google", "Google Reviews"


#: Channels supporting inbound DMs we can natively reply to.
#: LinkedIn is absent deliberately — no commercial DM API exists.
DM_CAPABLE_CHANNELS = [
    Channel.WHATSAPP, Channel.INSTAGRAM, Channel.FACEBOOK,
    Channel.TIKTOK, Channel.X,
]

#: Channels exposing comments / mentions. TikTok absent — not exposed via API.
COMMENT_CAPABLE_CHANNELS = [
    Channel.INSTAGRAM, Channel.FACEBOOK, Channel.LINKEDIN, Channel.X,
]


class InteractionKind(models.TextChoices):
    MESSAGE = "message", "Message"
    COMMENT = "comment", "Comment"
    MENTION = "mention", "Mention"
    TAG = "tag", "Tag"
    REVIEW = "review", "Review"


class InteractionStatus(models.TextChoices):
    NEW = "new", "New"
    TRIAGED = "triaged", "Triaged"
    DRAFTED = "drafted", "Drafted"
    AWAITING_APPROVAL = "awaiting_approval", "Awaiting approval"
    SENT = "sent", "Sent"
    DISMISSED = "dismissed", "Dismissed"


#: An interaction in any of these states is an unanswered customer.
#: This set defines "attention leak" — the core product metric.
UNANSWERED_STATUSES = [
    InteractionStatus.NEW, InteractionStatus.TRIAGED,
    InteractionStatus.DRAFTED, InteractionStatus.AWAITING_APPROVAL,
]


class Sentiment(models.TextChoices):
    POSITIVE = "positive", "Positive"
    NEUTRAL = "neutral", "Neutral"
    NEGATIVE = "negative", "Negative"


class Priority(models.IntegerChoices):
    LOW = 1, "Low"
    NORMAL = 2, "Normal"
    HIGH = 3, "High"
    URGENT = 4, "Urgent"


class SubscriptionTier(models.TextChoices):
    STARTER = "starter", "Starter"
    GROWTH = "growth", "Growth"
    SCALE = "scale", "Scale"


TIER_PRICING_NGN = {
    SubscriptionTier.STARTER: 15000,
    SubscriptionTier.GROWTH: 45000,
    SubscriptionTier.SCALE: 120000,
}

TIER_LIMITS = {
    SubscriptionTier.STARTER: {"channels": 3, "seats": 1, "ai_drafts": 200},
    SubscriptionTier.GROWTH: {"channels": 7, "seats": 5, "ai_drafts": 2000},
    SubscriptionTier.SCALE: {"channels": 7, "seats": 20, "ai_drafts": None},
}


class SubscriptionStatus(models.TextChoices):
    TRIAL = "trial", "Trial"
    ACTIVE = "active", "Active"
    PAST_DUE = "past_due", "Past due"
    GRACE = "grace", "Grace period"
    READ_ONLY = "read_only", "Read only"
    CANCELLED = "cancelled", "Cancelled"


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    FAILED = "failed", "Failed"
    REFUNDED = "refunded", "Refunded"


# ---------------------------------------------------------------------------
# Tenancy
# ---------------------------------------------------------------------------

class Tenant(models.Model):
    """A business using Command Centre. Avion Hub is tenant zero."""
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    timezone = models.CharField(max_length=64, default="Africa/Lagos")
    quiet_hours_start = models.TimeField(default="08:00")
    quiet_hours_end = models.TimeField(default="20:00")
    brand_voice = models.TextField(
        blank=True, help_text="Tone guidance injected into AI draft prompts.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantScopedModel(models.Model):
    """Base for every tenant-owned record. Enforces BR-07 (isolation)."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)

    class Meta:
        abstract = True


DEFAULT_NOTIFY_PREFS = {
    "new_message": {"in_app": True, "email": False},
    "mention": {"in_app": True, "email": False},
    "review": {"in_app": True, "email": True},
}


class UserProfile(models.Model):
    """
    Links an auth user to their tenant and holds per-user preferences.

    Multi-tenant from day one: which business a signed-in user operates on is
    resolved from here, not hardcoded.
    """
    user = models.OneToOneField(
        "auth.User", on_delete=models.CASCADE, related_name="profile",
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="members",
    )
    notify_prefs = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Profile<{self.user.username}>"


# ---------------------------------------------------------------------------
# Billing (Monnify)
# ---------------------------------------------------------------------------

class Subscription(TenantScopedModel):
    """
    One subscription per tenant. State is driven exclusively by verified
    Monnify webhooks (BR-04) — never by a client-side success message.
    """
    tier = models.CharField(
        max_length=20, choices=SubscriptionTier.choices,
        default=SubscriptionTier.STARTER,
    )
    status = models.CharField(
        max_length=20, choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.TRIAL,
    )
    amount_ngn = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    billing_cycle = models.CharField(max_length=20, default="monthly")
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)

    # Monnify linkage
    monnify_customer_ref = models.CharField(max_length=120, blank=True)
    payment_method = models.CharField(max_length=30, blank=True)
    card_token = models.CharField(max_length=255, blank=True)
    reserved_account_number = models.CharField(max_length=20, blank=True)
    reserved_account_bank = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_entitled(self) -> bool:
        """Can this tenant still send? Read-only/cancelled cannot."""
        return self.status in (
            SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE,
        )

    @property
    def limits(self) -> dict:
        return TIER_LIMITS[self.tier]

    def __str__(self):
        return f"{self.tenant.name} — {self.get_tier_display()} ({self.status})"


class PaymentTransaction(TenantScopedModel):
    """
    One row per payment ATTEMPT.

    payment_reference is ours and unique (BR-05) — the idempotency key that
    makes duplicate Monnify webhooks safe no-ops.
    transaction_reference is generated by Monnify.
    """
    payment_reference = models.CharField(max_length=120, unique=True)
    monnify_transaction_reference = models.CharField(max_length=120, blank=True)

    tier = models.CharField(max_length=20, choices=SubscriptionTier.choices)
    amount_ngn = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
    )
    payment_method = models.CharField(max_length=40, blank=True)
    checkout_url = models.URLField(blank=True, max_length=500)

    initiated_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    webhook_received_at = models.DateTimeField(null=True, blank=True)
    raw_payload = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-initiated_at"]

    def __str__(self):
        return f"{self.payment_reference} — {self.status}"


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------

class ChannelConnection(TenantScopedModel):
    """A tenant's linked account on one platform."""
    channel = models.CharField(max_length=20, choices=Channel.choices)
    external_account_id = models.CharField(max_length=200)
    display_name = models.CharField(max_length=200)
    handle = models.CharField(max_length=200, blank=True)

    oauth_tokens = models.JSONField(default=dict, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=30, default="connected")
    is_mock = models.BooleanField(
        default=False,
        help_text="Demo mode — served by MockAdapter behind the real interface.",
    )
    connected_at = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("tenant", "channel", "external_account_id")]

    def __str__(self):
        return f"{self.tenant.name} — {self.get_channel_display()}"


# ---------------------------------------------------------------------------
# The atomic inbox unit
# ---------------------------------------------------------------------------

class Interaction(TenantScopedModel):
    """
    Every inbound event from every platform normalizes to this shape.
    UNIQUE(channel, external_id) makes ingestion idempotent across both
    webhook retries and poll overlap.
    """
    channel = models.CharField(max_length=20, choices=Channel.choices)
    external_id = models.CharField(max_length=200)
    kind = models.CharField(max_length=20, choices=InteractionKind.choices)

    thread_id = models.CharField(max_length=200, blank=True, db_index=True)
    parent_ref = models.CharField(max_length=200, blank=True)
    permalink = models.URLField(blank=True, max_length=500)

    author_handle = models.CharField(max_length=200)
    author_display_name = models.CharField(max_length=200)
    author_external_id = models.CharField(max_length=200, blank=True)
    author_avatar_url = models.URLField(blank=True, max_length=500)

    body = models.TextField()
    media = models.JSONField(default=list, blank=True)
    rating = models.IntegerField(null=True, blank=True)  # reviews only

    received_at = models.DateTimeField()
    sentiment = models.CharField(
        max_length=20, choices=Sentiment.choices, default=Sentiment.NEUTRAL,
    )
    intent = models.CharField(max_length=60, blank=True)
    priority = models.IntegerField(choices=Priority.choices, default=Priority.NORMAL)
    sla_due_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=30, choices=InteractionStatus.choices,
        default=InteractionStatus.NEW,
    )
    is_outbound = models.BooleanField(default=False)
    answered_at = models.DateTimeField(null=True, blank=True)
    first_response_seconds = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = [("channel", "external_id")]
        ordering = ["-received_at"]
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "channel", "kind"]),
        ]

    @property
    def is_unanswered(self) -> bool:
        return (not self.is_outbound) and self.status in UNANSWERED_STATUSES

    @property
    def waiting_seconds(self) -> int:
        if not self.is_unanswered:
            return 0
        return int((timezone.now() - self.received_at).total_seconds())

    def __str__(self):
        return f"[{self.channel}] {self.author_display_name}: {self.body[:40]}"


class Draft(models.Model):
    """AI-generated reply awaiting the human gate (BR-01)."""
    interaction = models.OneToOneField(
        Interaction, on_delete=models.CASCADE, related_name="draft",
    )
    generated_text = models.TextField()
    model = models.CharField(max_length=80, default="claude-sonnet-4-6")
    confidence = models.FloatField(default=0.0)
    knowledge_refs = models.JSONField(default=list, blank=True)
    requires_escalation = models.BooleanField(
        default=False,
        help_text="Money/legal/PR adjacent — never eligible for auto-send.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Draft for interaction {self.interaction_id}"


class ApprovalAction(models.Model):
    """
    The human gate record. Edits are training signal for brand voice —
    the per-tenant moat described in the MRD.
    """
    DECISIONS = [("approve", "Approve"), ("edit", "Edit"), ("reject", "Reject")]

    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, related_name="approvals")
    actor = models.CharField(max_length=120, default="owner")
    decision = models.CharField(max_length=20, choices=DECISIONS)
    final_text = models.TextField(blank=True)
    decided_at = models.DateTimeField(auto_now_add=True)


# ---------------------------------------------------------------------------
# Publish & Measure
# ---------------------------------------------------------------------------

class Post(TenantScopedModel):
    """Write once, publish to many platforms."""
    body = models.TextField()
    media = models.JSONField(default=list, blank=True)
    target_channels = models.JSONField(default=list)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=30, default="draft")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class PostPublication(models.Model):
    """Per-channel result of publishing a Post."""
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="publications")
    channel = models.CharField(max_length=20, choices=Channel.choices)
    external_post_id = models.CharField(max_length=200, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=30, default="pending")
    error = models.TextField(blank=True)
    # denormalised engagement for the demo analytics table
    impressions = models.IntegerField(default=0)
    engagements = models.IntegerField(default=0)


class Metric(TenantScopedModel):
    """Per-channel, optionally per-post, time-bounded metric value."""
    channel = models.CharField(max_length=20, choices=Channel.choices)
    external_post_id = models.CharField(max_length=200, blank=True)
    metric_name = models.CharField(max_length=60)
    value = models.FloatField()
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()


class AttentionSnapshot(TenantScopedModel):
    """
    Powers the differentiator dashboard. Captured per channel so the UI can
    show *response equity* — which platform is being neglected.
    """
    captured_at = models.DateTimeField(default=timezone.now)
    channel = models.CharField(max_length=20, choices=Channel.choices)
    unanswered_count = models.IntegerField(default=0)
    oldest_unanswered_seconds = models.IntegerField(default=0)
    median_first_response_seconds = models.IntegerField(null=True, blank=True)
    answered_within_5min_pct = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-captured_at"]


# ---------------------------------------------------------------------------
# Outbound message queue
# ---------------------------------------------------------------------------

class OutboundStatus(models.TextChoices):
    QUEUED = "queued", "Queued"          # accepted, waiting to be delivered
    SENDING = "sending", "Sending"        # a worker is attempting delivery now
    SENT = "sent", "Sent"                 # delivered to the platform
    FAILED = "failed", "Failed"           # gave up after retries / policy block
    CANCELLED = "cancelled", "Cancelled"  # withdrawn before delivery


#: Terminal states — the queue worker will not touch these again.
OUTBOUND_TERMINAL = [
    OutboundStatus.SENT, OutboundStatus.FAILED, OutboundStatus.CANCELLED,
]

#: Give up after this many delivery attempts.
OUTBOUND_MAX_ATTEMPTS = 8


class OutboundMessage(TenantScopedModel):
    """
    A human-composed outbound message, durably queued before delivery.

    This is what makes the app resilient to flaky networks: the owner can
    start, continue or reply to a conversation and the message is persisted
    immediately. A worker drains the queue with exponential backoff, so a
    message survives 'small or no network' and goes out once a platform is
    reachable again — nothing is lost and nothing is sent twice.

    Idempotency: the client generates `client_id` (a UUID) and reuses it on
    retries, so a message re-submitted after a dropped connection is matched
    to the existing row instead of duplicated. UNIQUE(tenant, client_id).
    """
    client_id = models.CharField(
        max_length=64,
        help_text="Client-generated idempotency key (UUID), stable across retries.",
    )
    channel = models.CharField(max_length=20, choices=Channel.choices)
    thread_id = models.CharField(max_length=200, blank=True, db_index=True)

    # The inbound interaction this replies to, when continuing a conversation.
    parent_interaction = models.ForeignKey(
        Interaction, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="outbound_replies",
    )
    # For a brand-new conversation started by the owner.
    recipient_handle = models.CharField(max_length=200, blank=True)
    recipient_display_name = models.CharField(max_length=200, blank=True)

    body = models.TextField()
    used_ai_draft = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20, choices=OutboundStatus.choices,
        default=OutboundStatus.QUEUED,
    )
    attempts = models.IntegerField(default=0)
    last_error = models.TextField(blank=True)
    next_attempt_at = models.DateTimeField(default=timezone.now)

    # Set once delivered.
    external_id = models.CharField(max_length=200, blank=True)
    interaction = models.ForeignKey(
        Interaction, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
        help_text="The outbound Interaction row created in the thread on send.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("tenant", "client_id")]
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["tenant", "status", "next_attempt_at"]),
            models.Index(fields=["tenant", "thread_id"]),
        ]

    @property
    def is_pending(self) -> bool:
        return self.status in (OutboundStatus.QUEUED, OutboundStatus.SENDING)

    def __str__(self):
        return f"[{self.channel}] {self.status}: {self.body[:40]}"
