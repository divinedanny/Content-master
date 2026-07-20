# Command Centre — Backend

One inbox for every platform. Built so a business can give attention to
every customer at once, instead of leaking it to whichever app is open.

**Stack:** Django 6 + DRF · SQLite (dev) · Monnify (subscription billing)

---

## Quick start

```bash
pip install django djangorestframework django-cors-headers python-dotenv requests

cp .env.example .env        # then paste your Monnify SANDBOX credentials
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Verify everything works:

```bash
python verify_demo.py      # attention dashboard
python verify_flows.py     # inbox, tab filter, approval gate, native send
python verify_billing.py   # Monnify lifecycle + idempotency
```

---

## Monnify configuration

Put your **sandbox** credentials in `.env` (never commit this file — it is
already in `.gitignore`):

```
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=...
MONNIFY_SECRET_KEY=...
MONNIFY_CONTRACT_CODE=...
MONNIFY_REDIRECT_URL=http://localhost:3000/billing/callback
```

Then in the **Monnify dashboard → Developer → Webhook URLs**, set the
Transaction Completion URL to:

```
https://<your-public-url>/webhooks/monnify/
```

For local development, expose your machine with ngrok or similar — Monnify
must be able to reach the callback.

**Without credentials the system still runs.** `initiate_checkout` falls back
to a clearly-flagged simulated checkout (`"simulated": true`), and
`/api/billing/simulate-payment/` replays a Monnify-shaped payload through the
*same* `process_transaction_webhook` code path a real webhook uses. Nothing is
faked downstream — only the network hop is skipped.

### How billing is designed

| Concern | Handling |
|---|---|
| Source of truth | The **webhook**, never a client-side success message (BR-04) |
| Idempotency | `payment_reference` is `UNIQUE` in the DB; replayed webhooks are no-ops (BR-05) |
| Signature | SHA-512 HMAC over the **raw** request body, constant-time compared |
| Timeouts | 200 returned immediately; processing happens after |
| Unknown references | Still 200, so Monnify does not retry into a poison loop |
| Secrets | Environment variables only — never in code, never client-side |
| Failed renewal | `active → past_due → grace → read_only`. Data is never deleted (BR-06) |

---

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/attention/` | Attention Leak dashboard — unanswered count, oldest wait, most-neglected channel, per-channel response equity |
| `GET /api/channels/` | Channels with real capability constraints |
| `GET /api/inbox/?channel=&kind=&unanswered=` | Unified inbox — one endpoint powers Messages, Comments and Reviews |
| `GET /api/inbox/<id>/thread/` | Conversation view + send-policy decision |
| `POST /api/inbox/<id>/approve/` | **The human gate** — approve/edit/reject, then native send |
| `GET POST /api/posts/` | Multi-platform publishing |
| `GET /api/analytics/` | Per-channel and cross-channel metrics |
| `GET /api/billing/subscription/` | Current tier, status, limits |
| `POST /api/billing/checkout/` | Start Monnify payment → `checkoutUrl` |
| `POST /webhooks/monnify/` | Monnify Transaction Completion |

---

## Architecture

```
CHANNEL ADAPTERS (one interface, many platforms)
  MockAdapter  ← demo mode, identical contract to production adapters
  MetaAdapter · TikTokAdapter · LinkedInAdapter · XAdapter · GoogleReviewsAdapter
        ↓  normalized Interaction
INGESTION (idempotent: UNIQUE(channel, external_id))
        ↓
TRIAGE (intent · sentiment · priority · SLA)
        ↓
DRAFT ENGINE (AI writes, cites knowledge base, flags escalations)
        ↓
★ APPROVAL QUEUE — the human gate ★
        ↓
OUTBOUND → adapter.send_reply() → lands in the customer's own native thread
```

**Why the mock strategy matters:** `MockAdapter` implements the exact
`ChannelAdapter` contract the production adapters will implement. Going live
means registering a real adapter in `core/adapters/registry.py` — the
ingestion, triage, drafting, approval and send pipeline is untouched. Nothing
built for the demo is thrown away.

---

## Real platform constraints (encoded, not hidden)

These are enforced in `core/adapters/base.py` and surfaced through the API, so
the product tells the truth about what each platform permits.
*Verified July 2026 — re-check before production.*

| Platform | Reality |
|---|---|
| **WhatsApp / Instagram / Facebook** | Free-form replies for 24h after the customer's last message; templates outside it |
| **LinkedIn** | **No commercial DM API.** Page comments and @mentions only. Profile data purged at 24h, activity at 48h |
| **TikTok** | Business DMs only — comments are not exposed via API. Publishing requires media |
| **Google Reviews** | **Polled, not pushed** — no webhooks exist. Needs a verified profile 60+ days old |
| **X** | Pay-per-use, no free tier for new developers. A cost decision, not an approval one |

### Quiet hours — a deliberate design decision

Quiet hours (08:00–20:00 WAT) apply to **proactive outbound only**, not to
replies inside an active conversation window. Blocking a reply to a customer
who just asked a question at 23:00 would manufacture the very attention leak
this product exists to remove.

---

## What's next

1. Frontend (Next.js) — Home / Messages / Comments / Posts / Analytics / Settings, each with per-platform tabs
2. Live Claude drafting (currently seeded templates)
3. Real adapters as platform approvals land

**File the platform approvals now** — Meta App Review, Google Business Profile
(needs a verified profile 60+ days old, so the clock starts today), LinkedIn
Standard tier, TikTok Business Messaging. These are calendar time, not
engineering time, and they run in parallel with the build.
