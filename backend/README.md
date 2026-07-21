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

Verify everything works — see **Testing** below.

---

## Testing

There's no `pytest`/`manage.py test` suite yet — verification is three
scripts that drive the real API through Django's test `Client`, plus Django's
own system checks. Demo data must exist first (`python manage.py seed_demo`),
since these scripts read and mutate it.

```bash
python manage.py check                     # settings, URLs, model integrity — no server needed

python verify_demo.py                       # 1. attention dashboard: unanswered/oldest/median per channel
python verify_flows.py                      # 2. unified inbox, per-platform filter, approval gate -> native send
python verify_billing.py                    # 3. Monnify checkout -> webhook -> activation, and idempotent replay
```

Each script:

1. Logs in as the demo user `seed_demo` creates (`demo@avionhub.ng` /
   `demo1234` by default — override with `DEMO_EMAIL`/`DEMO_PASSWORD` env
   vars if you changed them) and attaches the bearer token to every request.
   Every endpoint requires auth (`base.py`'s `DEFAULT_PERMISSION_CLASSES`),
   so a script that skips this step gets `403`s, not real responses.
2. Prints what it did and the API's response, so a failed assertion or a
   wrong-looking number is visible immediately — these are read-through
   smoke tests, not silent pass/fail.

`verify_flows.py` step 4 approves a draft that may be **outside** its
platform's 24h reply window depending on when `seed_demo` last ran (a
`409` there with `"requires_template": true` is the send-policy gate working
correctly, not a bug — re-run `seed_demo` to refresh the timestamps if you
want to see a `200` instead).

Re-run `python manage.py seed_demo` between test passes — `verify_billing.py`
and `verify_flows.py` both mutate state (a subscription activates, a draft
gets approved and sent), so results drift on repeated runs otherwise.

### Testing WhatsApp Embedded Signup (the Settings "Connect account" popup)

This one can't be scripted — it's a real Facebook popup — so it needs manual
verification once `WHATSAPP_APP_ID`/`WHATSAPP_CONFIG_ID`/`WHATSAPP_APP_SECRET`
are set in `.env` and the matching `NEXT_PUBLIC_WHATSAPP_APP_ID`/
`NEXT_PUBLIC_WHATSAPP_CONFIG_ID` are set in `frontend/.env.local`:

1. `python manage.py runserver` + `npm run dev` (frontend), signed in as any user.
2. Settings → Channel connections → WhatsApp → **Connect account**.
3. Complete the popup with a real WhatsApp Business number.
4. Confirm in Settings: the card flips to "Connected" with the real phone
   number as its handle (not "Connected (demo)").
5. Confirm in the Django shell that the connection now carries per-tenant
   credentials, not the shared `.env` token:
   ```bash
   python manage.py shell -c "
   from core.models import ChannelConnection
   c = ChannelConnection.objects.filter(channel='whatsapp', is_mock=False).latest('connected_at')
   print(c.tenant, c.handle, sorted(c.oauth_tokens.keys()))"
   ```
   Expect `['access_token', 'phone_number_id', 'waba_id']`.
6. Send a WhatsApp message to that number from a real phone and confirm it
   lands in the inbox — this exercises `_whatsapp_connection_for_payload()`
   routing the webhook to the right tenant by `phone_number_id`.

### Manual API testing (curl)

Useful when you want to hit one endpoint directly instead of running a whole
verify script:

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@avionhub.ng","password":"demo1234"}' | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s localhost:8000/api/attention/ -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

### Frontend

The frontend has no automated tests either. To exercise it manually:
`cd ../frontend && npm run dev`, then walk the golden path — register/login,
Dashboard's attention numbers match `verify_demo.py`'s, Messages → approve a
draft → it appears sent, Settings → connect/disconnect a channel.

---

## Monnify configuration

Put your **sandbox** credentials in `.env` (copied from `.env.example`, which
documents every variable — WhatsApp, Monnify, and the per-platform OAuth
apps). `.env` is already in `.gitignore`: never commit it, and never paste
real values from it into a doc, PR description, or issue — treat every
`ACCESS_TOKEN`/`SECRET`/`API_KEY` in there as a live credential.

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
