"""
Seed realistic demo data for the competition build (DRD §5.4).

The data is deliberately IMBALANCED: WhatsApp is mostly answered because
that is where the owner's attention has been, while Instagram and TikTok
are badly neglected. This makes the Attention Leak dashboard tell the core
story the instant it loads, without narration.
"""

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    Channel, ChannelConnection, Draft, Interaction, InteractionKind,
    InteractionStatus, Metric, Post, PostPublication, Priority, Sentiment,
    Subscription, SubscriptionStatus, SubscriptionTier, Tenant,
)

NIGERIAN_NAMES = [
    ("Chiamaka Okonkwo", "chiamaka.o"), ("Tunde Adeyemi", "tunde_adeyemi"),
    ("Aisha Bello", "aisha.bello"), ("Emeka Nwosu", "emeka_nwosu"),
    ("Folake Adebayo", "folake.a"), ("Ibrahim Musa", "ibrahim.musa"),
    ("Ngozi Eze", "ngozi_eze"), ("Segun Oladipo", "segun.oladipo"),
    ("Halima Yusuf", "halima.y"), ("Chidi Anyanwu", "chidi_a"),
    ("Bisi Ogunleye", "bisi.ogunleye"), ("Kelechi Obi", "kelechi.obi"),
    ("Amaka Ihedioha", "amaka.i"), ("Yemi Fashola", "yemi_fashola"),
    ("Zainab Lawal", "zainab.lawal"), ("Obinna Chukwu", "obinna.c"),
    ("Temitope Bakare", "temitope.b"), ("Fatima Sani", "fatima.sani"),
]

# (body, intent, sentiment, priority)
TRAVEL_ENQUIRIES = [
    ("Good afternoon, how much is a return ticket Lagos to Dubai for December? Travelling with my wife.", "flight_enquiry", Sentiment.NEUTRAL, Priority.HIGH),
    ("Please I need Lagos to London urgently, travelling next week Friday. What are my options?", "flight_enquiry", Sentiment.NEUTRAL, Priority.URGENT),
    ("Do you handle visa assistance too or just flights?", "service_enquiry", Sentiment.NEUTRAL, Priority.NORMAL),
    ("I saw your post about the Zanzibar package. Is it still available for two people?", "package_enquiry", Sentiment.POSITIVE, Priority.HIGH),
    ("Hello, I want to book Abuja to Jeddah for umrah. Family of 4.", "flight_enquiry", Sentiment.NEUTRAL, Priority.HIGH),
    ("How much for Lagos to Accra one way? Need it for Thursday.", "flight_enquiry", Sentiment.NEUTRAL, Priority.HIGH),
    ("Can I pay in instalments for the South Africa package?", "payment_enquiry", Sentiment.NEUTRAL, Priority.NORMAL),
    ("Still waiting for the quote you promised yesterday o.", "follow_up", Sentiment.NEGATIVE, Priority.URGENT),
    ("What documents do I need for a Canada visitor visa?", "service_enquiry", Sentiment.NEUTRAL, Priority.NORMAL),
    ("Is the Dubai package inclusive of hotel?", "package_enquiry", Sentiment.NEUTRAL, Priority.NORMAL),
    ("Please send me your account details, I want to make payment now.", "payment_enquiry", Sentiment.POSITIVE, Priority.URGENT),
    ("Do you have anything cheaper than what you sent? My budget is 1.2m", "price_negotiation", Sentiment.NEUTRAL, Priority.HIGH),
    ("Hi, are you still in business? Nobody replied my message last week.", "complaint", Sentiment.NEGATIVE, Priority.URGENT),
    ("My flight is tomorrow and I have not received my ticket!", "complaint", Sentiment.NEGATIVE, Priority.URGENT),
    ("Thank you so much, the trip was perfect. Will definitely use you again.", "praise", Sentiment.POSITIVE, Priority.LOW),
]

COMMENTS = [
    ("How much?", "price_enquiry", Sentiment.NEUTRAL),
    ("Is this available for January?", "availability", Sentiment.NEUTRAL),
    ("DM me the details please", "lead", Sentiment.POSITIVE),
    ("Price?", "price_enquiry", Sentiment.NEUTRAL),
    ("I used them last year, very reliable 👏", "praise", Sentiment.POSITIVE),
    ("Do you do group bookings?", "service_enquiry", Sentiment.NEUTRAL),
    ("Sent you a message, no response yet", "complaint", Sentiment.NEGATIVE),
    ("Location please?", "service_enquiry", Sentiment.NEUTRAL),
]

REVIEWS = [
    (5, "Booked my Dubai trip through Avion Hub. Very professional and responsive on WhatsApp. Highly recommend.", Sentiment.POSITIVE),
    (4, "Good service overall, ticket came through quickly. Only issue was the initial delay in responding.", Sentiment.POSITIVE),
    (2, "I sent a message on Instagram twice and nobody responded for days. Had to book elsewhere. Disappointing.", Sentiment.NEGATIVE),
    (5, "Excellent! They sorted my visa and flight together. Stress free.", Sentiment.POSITIVE),
    (1, "Very poor communication. Nobody picks up or replies messages. Avoid.", Sentiment.NEGATIVE),
    (5, "Reliable agency in Lagos. Fair prices and they explain everything.", Sentiment.POSITIVE),
]

POSTS = [
    "✈️ DECEMBER SPECIAL: Lagos → Dubai from ₦850,000 return. 5 nights hotel included. Limited slots. DM to book.",
    "Visa success story 🇨🇦 Another client approved for Canada visitor visa this week. We handle the full process.",
    "Zanzibar package 🌴 7 nights, flights + hotel + transfers. Group departures every month. Ask us for details.",
    "Travelling for Umrah this season? We handle flights, visa and accommodation. Talk to us today.",
]

DRAFT_TEMPLATES = {
    "flight_enquiry": "Good day {name}, thank you for reaching out. I'm checking live fares for that route now and will send you options with prices shortly. May I confirm your preferred travel dates and whether you'd like economy or business?",
    "package_enquiry": "Hello {name}, thank you for your interest. Yes, that package is still available. It includes flights, hotel and airport transfers. I'll send the full breakdown and current pricing right away.",
    "payment_enquiry": "Thank you {name}. I'll send our verified account details and the payment breakdown now. Kindly note we confirm all payments before ticketing.",
    "complaint": "I'm very sorry about this, {name}, and I understand your frustration. Let me look into your booking immediately and come back to you with a clear update. Could you confirm your booking reference?",
    "follow_up": "My sincere apologies for the delay, {name}. I'm pulling your quote together now and will have it with you within the hour.",
    "service_enquiry": "Hello {name}, yes we do. I'll send you the full requirements and our process. Would you like me to call you to talk it through?",
    "price_negotiation": "Thank you {name}. Let me check what options we have within that budget and revert with the best available fares.",
    "praise": "Thank you so much for the kind words, {name}! It was a pleasure arranging your trip. We look forward to welcoming you back.",
    "price_enquiry": "Hi {name}, thanks for asking! I've sent you a DM with the current pricing.",
    "availability": "Hello {name}, yes we have availability. I'll DM you the details.",
    "lead": "Thanks {name}! Just sent you a DM with everything you need.",
}

ESCALATION_INTENTS = {"complaint", "payment_enquiry", "price_negotiation", "follow_up"}


class Command(BaseCommand):
    help = "Seed realistic demo data for the Command Centre competition build."

    def handle(self, *args, **options):
        self.stdout.write("Seeding Command Centre demo data...")

        Interaction.objects.all().delete()
        Post.objects.all().delete()
        Metric.objects.all().delete()
        ChannelConnection.objects.all().delete()
        Tenant.objects.all().delete()

        tenant = Tenant.objects.create(
            name="Avion Hub",
            slug="avion-hub",
            timezone="Africa/Lagos",
            brand_voice=(
                "Warm, professional Nigerian customer service. Courteous and "
                "direct. Never promise a price or availability without "
                "confirming from the system first."
            ),
        )

        Subscription.objects.create(
            tenant=tenant,
            tier=SubscriptionTier.STARTER,
            status=SubscriptionStatus.TRIAL,
            current_period_start=timezone.now() - timedelta(days=11),
            current_period_end=timezone.now() + timedelta(days=3),
        )

        connections = {}
        for channel, handle in [
            (Channel.WHATSAPP, "+234 801 234 5678"),
            (Channel.INSTAGRAM, "@avionhub"),
            (Channel.FACEBOOK, "Avion Hub Travel"),
            (Channel.TIKTOK, "@avionhub"),
            (Channel.LINKEDIN, "Avion Hub Travel Ltd"),
            (Channel.X, "@avionhub"),
            (Channel.GOOGLE, "Avion Hub Travel — Lagos"),
        ]:
            connections[channel] = ChannelConnection.objects.create(
                tenant=tenant, channel=channel,
                external_account_id=f"mock_{channel}_001",
                display_name=handle, handle=handle, is_mock=True,
                last_synced_at=timezone.now(),
            )

        now = timezone.now()
        counter = 0

        def make_interaction(channel, kind, body, intent, sentiment, priority,
                             hours_ago, answered, name_pair, rating=None):
            nonlocal counter
            counter += 1
            display_name, handle = name_pair
            received = now - timedelta(hours=hours_ago, minutes=random.randint(0, 55))

            if answered:
                status = InteractionStatus.SENT
                response_seconds = random.randint(120, 1800)
                answered_at = received + timedelta(seconds=response_seconds)
            else:
                status = InteractionStatus.AWAITING_APPROVAL
                response_seconds = None
                answered_at = None

            interaction = Interaction.objects.create(
                tenant=tenant, channel=channel,
                external_id=f"{channel}_{counter}_{random.randint(1000,9999)}",
                kind=kind,
                thread_id=f"{channel}_thread_{counter}",
                permalink=f"https://example.com/{channel}/{counter}",
                author_handle=handle, author_display_name=display_name,
                author_external_id=f"user_{counter}",
                body=body, rating=rating, received_at=received,
                sentiment=sentiment, intent=intent, priority=priority,
                sla_due_at=received + timedelta(minutes=5),
                status=status, answered_at=answered_at,
                first_response_seconds=response_seconds,
            )

            # Unanswered items get an AI draft waiting at the human gate.
            if not answered and intent in DRAFT_TEMPLATES:
                Draft.objects.create(
                    interaction=interaction,
                    generated_text=DRAFT_TEMPLATES[intent].format(
                        name=display_name.split()[0]
                    ),
                    confidence=round(random.uniform(0.78, 0.96), 2),
                    requires_escalation=intent in ESCALATION_INTENTS,
                    knowledge_refs=["brand_voice", "faq_pricing"],
                )
            return interaction

        # -- The imbalance: WhatsApp attended, Instagram/TikTok neglected ----
        #    answered_ratio drives the story the dashboard tells.
        channel_profile = {
            Channel.WHATSAPP:  {"count": 12, "answered_ratio": 0.85},
            Channel.INSTAGRAM: {"count": 10, "answered_ratio": 0.20},
            Channel.FACEBOOK:  {"count": 6,  "answered_ratio": 0.50},
            Channel.TIKTOK:    {"count": 7,  "answered_ratio": 0.15},
            Channel.X:         {"count": 4,  "answered_ratio": 0.50},
        }

        for channel, profile in channel_profile.items():
            count = profile["count"]
            # Deterministic split: guarantees at least one answered item per
            # channel so every channel has a comparable median response time,
            # while preserving the intended neglect ratios.
            answered_count = max(1, round(count * profile["answered_ratio"]))
            for i in range(count):
                body, intent, sentiment, priority = random.choice(TRAVEL_ENQUIRIES)
                make_interaction(
                    channel=channel, kind=InteractionKind.MESSAGE,
                    body=body, intent=intent, sentiment=sentiment,
                    priority=priority,
                    hours_ago=random.randint(1, 70),
                    answered=(i < answered_count),
                    name_pair=random.choice(NIGERIAN_NAMES),
                )

        # -- Comments & mentions --------------------------------------------
        for channel in [Channel.INSTAGRAM, Channel.FACEBOOK, Channel.LINKEDIN, Channel.X]:
            for i in range(random.randint(3, 5)):
                body, intent, sentiment = random.choice(COMMENTS)
                make_interaction(
                    channel=channel, kind=InteractionKind.COMMENT,
                    body=body, intent=intent, sentiment=sentiment,
                    priority=Priority.NORMAL,
                    hours_ago=random.randint(2, 60),
                    answered=random.random() < 0.35,
                    name_pair=random.choice(NIGERIAN_NAMES),
                )

        # -- Google reviews (one deliberately old and negative) --------------
        for idx, (rating, body, sentiment) in enumerate(REVIEWS):
            make_interaction(
                channel=Channel.GOOGLE, kind=InteractionKind.REVIEW,
                body=body, intent="review", sentiment=sentiment,
                priority=Priority.HIGH if rating <= 2 else Priority.NORMAL,
                hours_ago=[30, 55, 216, 80, 140, 190][idx],
                answered=(rating >= 4 and idx != 1),
                name_pair=random.choice(NIGERIAN_NAMES),
                rating=rating,
            )

        # -- Posts & publications -------------------------------------------
        for idx, body in enumerate(POSTS):
            targets = [Channel.INSTAGRAM, Channel.FACEBOOK, Channel.X]
            if idx % 2 == 0:
                targets.append(Channel.TIKTOK)
            post = Post.objects.create(
                tenant=tenant, body=body, target_channels=targets,
                published_at=now - timedelta(days=idx + 1, hours=3),
                status="published",
                media=[{"type": "image", "url": f"/media/post{idx}.jpg"}],
            )
            for channel in targets:
                impressions = random.randint(1200, 18000)
                PostPublication.objects.create(
                    post=post, channel=channel,
                    external_post_id=f"{channel}_pub_{post.id}",
                    published_at=post.published_at, status="published",
                    impressions=impressions,
                    engagements=int(impressions * random.uniform(0.03, 0.12)),
                )

        # -- Analytics metrics ----------------------------------------------
        for channel in [Channel.INSTAGRAM, Channel.FACEBOOK, Channel.TIKTOK,
                        Channel.X, Channel.LINKEDIN, Channel.WHATSAPP]:
            for day in range(14):
                period_start = now - timedelta(days=13 - day)
                for metric_name, base in [
                    ("reach", 3000), ("impressions", 5200),
                    ("engagement", 320), ("followers", 8400),
                ]:
                    Metric.objects.create(
                        tenant=tenant, channel=channel, metric_name=metric_name,
                        value=base * random.uniform(0.6, 1.5) + day * base * 0.02,
                        period_start=period_start,
                        period_end=period_start + timedelta(days=1),
                    )

        unanswered = Interaction.objects.filter(
            tenant=tenant, status=InteractionStatus.AWAITING_APPROVAL
        ).count()
        total = Interaction.objects.filter(tenant=tenant).count()

        self.stdout.write(self.style.SUCCESS(
            f"\nSeeded tenant '{tenant.name}'\n"
            f"  {total} interactions across 7 channels\n"
            f"  {unanswered} unanswered (the attention leak)\n"
            f"  {Draft.objects.count()} AI drafts waiting at the human gate\n"
            f"  {Post.objects.count()} posts, {Metric.objects.count()} metrics\n"
        ))
