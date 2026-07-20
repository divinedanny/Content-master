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
TikTok · LinkedIn · X · Google) — the defining interaction pattern.

## What's in here

| Folder | Stack | What it is |
|---|---|---|
| `backend/` | Django 6 + DRF, SQLite | The API — adapters, unified inbox, AI-draft approval gate, Monnify billing. Serves seeded demo data through the production `ChannelAdapter` contract via `MockAdapter`. |
| `frontend/` | Next.js 14 + TypeScript + Tailwind | The web MVP — six sections, mobile-responsive, talks to the backend API. |

## Product principles (non-negotiable, honoured in the UI)

1. **The human gate is the product.** Every AI draft passes through Approve / Edit / Reject —
   nothing auto-sends. The gate is visually prominent by design.
2. **Tell the truth about platform limits.** LinkedIn has no commercial DM API — the LinkedIn
   tab under Messages says so plainly instead of faking an inbox. TikTok comments aren't exposed;
   Google Reviews are polled, not pushed. These are surfaced, not hidden.
3. **Replies are native.** The UI makes clear a reply lands in the customer's own platform thread.
4. **The Monnify secret key never touches the client.** All payment calls go through Django;
   subscription activation is driven only by a verified server-side webhook.

---

## Running it

### 1. Backend (port 8000)

```bash
cd backend
pip install django djangorestframework django-cors-headers python-dotenv requests
python manage.py migrate
python manage.py seed_demo          # wipes + reseeds the Lagos demo dataset
python manage.py runserver 8000
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
(`NEXT_PUBLIC_API_BASE`, defaults to `http://localhost:8000`). CORS is already open for
`localhost:3000`.

---

## Demo narrative

1. **Home** — "36 customers unanswered, oldest waiting 9 days, most of them on Instagram."
2. **Messages** — click across the platform tabs; same interaction model everywhere. LinkedIn
   shows its honest no-DM state.
3. Open a neglected Instagram DM → AI draft waiting → edit a word → **Approve** → sends natively.
4. **Comments → Google Reviews** — a 1-star review surfaced first → approve a response.
5. **Analytics → Response equity** — the neglected channel, now measurable.
6. **Settings → Billing** — pick Growth → Monnify checkout → webhook → status flips to **Active**.

Gated channels run on mocked adapters behind the production interface; going live means
registering a real adapter in `backend/core/adapters/registry.py` — the ingestion, triage,
drafting, approval and send pipeline is untouched.
