# Command Centre

**One inbox for every platform.** A unified social command centre where WhatsApp,
Instagram, Facebook, TikTok, LinkedIn, X and Google Reviews live side by side — so a
conversational-commerce business can give attention to every customer at once instead of
leaking it to whichever app happens to be open.

Built by **Dayne Core Technologies**. Tenant zero is **Avion Hub**, a WhatsApp-native
Lagos travel agency.

---

## The idea in one screen

The product's thesis is _attention leak_: a business doesn't lose customers for lack of
channels, it loses them because human attention can't be in six places at once. The **Home**
dashboard makes that visible — unanswered count, oldest wait, the most-neglected channel, and
per-channel _response equity_ — then routes the owner straight to the backlog.

Every section carries a **per-platform tab strip** (All · WhatsApp · Instagram · Facebook ·
TikTok · LinkedIn · X · Google) — the defining interaction pattern. A **notifications bell** in
the top bar surfaces every waiting customer — new DMs, @mentions, comments and reviews — with a
live unread count, and **Mentions** is its own section so a tag never gets lost among comments.

## What's in here

| Folder | Stack | What it is |
|---|---|---|
| `backend/` | Django 6 + DRF, SQLite | The API — adapters, unified inbox, AI-draft approval gate, Monnify billing. Serves seeded demo data through the production `ChannelAdapter` contract via `MockAdapter`. |
| `frontend/` | Next.js 14 + TypeScript + Tailwind | The web MVP — Home, Messages, Comments, Mentions, Posts, Analytics, Settings — plus a notifications bell, mobile-responsive, talks to the backend API. |

## Messaging — start, continue, reply (with a durable outbound queue)

Messages behaves like a real DM client, not just an approval queue:

- **The human drives the conversation.** Any DM can be started, continued or replied to with a
  free-form composer. The AI is only an assistant — a one-click **"Use AI suggestion"** drops a
  draft into the box that you edit or ignore. Nothing auto-sends.
- **Start new conversations** from **New message** — pick a platform, a recipient, and go.
- **Offline-resilient by design.** Every composed message is written to a durable **client outbox**
  (localStorage) and rendered immediately, then delivered. On flaky or no network it stays queued
  and flushes automatically when connectivity returns — an offline banner and an **Outbox** chip
  show exactly what's pending, with per-message delivery ticks (queued ⏱ → sending → sent ✓✓) and
  one-tap retry. The server keeps its **own** durable queue (`OutboundMessage`) with idempotency
  (a stable `client_id` means nothing is ever sent twice), exponential-backoff retries, and
  quiet-hours-aware scheduling. Run the worker to drain it:

  ```bash
  python manage.py process_outbound        # long-lived worker, retries with backoff
  python manage.py process_outbound --once # single pass (e.g. from cron)
  ```

## Product principles (non-negotiable, honoured in the UI)

1. **The human sends — the AI only assists.** DMs are composed and sent by a person; the AI
   suggestion is optional. For public comments and reviews the Approve / Edit / Reject gate
   remains. Nothing auto-sends, ever.
2. **Tell the truth about platform limits.** LinkedIn has no commercial DM API — the LinkedIn
   tab under Messages says so plainly instead of faking an inbox. TikTok comments aren't exposed;
   Google Reviews are polled, not pushed. These are surfaced, not hidden.
3. **Replies are native.** The UI makes clear a reply lands in the customer's own platform thread.
4. **The Monnify secret key never touches the client.** All payment calls go through Django;
   subscription activation is driven only by a verified server-side webhook.

---

## Running it

### 1. Backend (port 8000)

Python 3.9+ works (3.10+ recommended).

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo          # wipes + reseeds the Lagos demo dataset
python manage.py runserver 8000
# in a second terminal — the outbound queue worker:
python manage.py process_outbound
```

Optional sanity checks:

```bash
python verify_demo.py     # attention dashboard
python verify_flows.py    # inbox, tab filter, approval gate, native send
python verify_billing.py  # Monnify lifecycle + idempotency
```

Monnify runs in a demo fallback without credentials: `checkout` returns a clearly-flagged
simulated URL and `simulate-payment` replays a Monnify-shaped payload through the **same**
webhook activation code path. Add sandbox credentials to `backend/.env` (see `.env.example`)
to hit the sandbox for real.

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The API base is configured in `frontend/.env.local`
(`NEXT_PUBLIC_API_BASE`, defaults to same-origin via the Next proxy).

### Signing in

The app is **login-required**. `seed_demo` creates a demo account so you can sign in right away
(override with `DEMO_EMAIL` / `DEMO_PASSWORD`):

```
demo@avionhub.ng  /  demo1234
```

Register, sign in, and forgot/reset-password all work. In MVP/Demo the password-reset link is
returned in the response (no mail server); wire SMTP for production. Auth uses signed bearer
tokens and the entire API requires authentication.

---

## Demo narrative

1. **Home** — "36 customers unanswered, oldest waiting 9 days, most of them on Instagram."
2. **Messages** — click across the platform tabs; same interaction model everywhere. LinkedIn
   shows its honest no-DM state.
3. Open a neglected Instagram DM → type a reply (or drop in the AI suggestion) → **Send** → it
   lands natively. Go offline and send again → it queues and flushes automatically on reconnect.
4. **Comments → Google Reviews** — a 1-star review surfaced first → approve a response.
5. **Analytics → Response equity** — the neglected channel, now measurable.
6. **Settings → Billing** — pick Growth → Monnify checkout → webhook → status flips to **Active**.

Gated channels run on mocked adapters behind the production interface; going live means
registering a real adapter in `backend/core/adapters/registry.py` — the ingestion, triage,
drafting, approval and send pipeline is untouched.

---

## Going to production

The application layer is built production-shaped; taking it live is configuration plus the
external platform approvals, not a rewrite.

- **Serving.** Run Django under `gunicorn` (not `runserver`), the Next.js frontend with
  `npm run build && npm run start`, and the **outbound worker** (`process_outbound`) as its own
  long-lived process. A single exposed port works end-to-end: the frontend proxies `/api` and
  `/webhooks` to Django (`next.config.mjs`), so the browser only ever talks to one origin.
- **Config via environment.** `DJANGO_DEBUG=false`, a real `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`,
  and Monnify sandbox/production keys (`backend/.env`, see `.env.example`). `BACKEND_ORIGIN` points
  the frontend proxy at the API host if it isn't `localhost:8000`.
- **Database.** Swap SQLite for PostgreSQL (uncomment `psycopg[binary]` in `requirements.txt`).
  The models, idempotency constraints and queue are DB-agnostic.
- **Live delivery** into WhatsApp/Instagram/etc. is the one piece that is *not* just code: it needs
  the platform API approvals and credentials (Meta App Review, WhatsApp templates, Google Business
  Profile, etc.). Those are account-and-calendar work. When each clears, register the real adapter
  in `registry.py` — everything above the adapter (compose, queue, retries, offline outbox,
  approval gate) already works against it.
