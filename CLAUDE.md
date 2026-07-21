# Command Centre — repo guide for Claude

## Standing rule: how backends are built here

**Always build backends to `docs/BACKEND_STANDARDS.md`.** Every backend must address, and ship
tiered across **MVP / Demo / Production**, all of: JWT + API-key auth, RBAC + ABAC, rate limiting,
Redis caching, WebSockets, Docker, database indexing, API gateway, SSL/TLS, CORS, SQL-injection
safety (ORM only — never string-interpolated SQL), database integration, reverse proxy, load
balancing, health checks, and cloud/Kubernetes deploy manifests. Hardening is prepared up front as
*configuration selected by `DJANGO_ENV`*, not retrofitted later.

When adding backend code, keep it consistent with this: put env-specific behaviour in
`backend/config/settings/{mvp,demo,production}.py`, index every query path, make retryable writes
idempotent, and keep secrets in env (never in the repo). Read `docs/BACKEND_STANDARDS.md` before
non-trivial backend work.

## Layout

```
backend/    Django + DRF. Tiered settings in config/settings/. Adapters, unified
            inbox, AI-draft gate, outbound queue (+ worker), Monnify billing.
frontend/   Next.js + TypeScript + Tailwind. Same-origin API proxy (next.config.mjs).
deploy/     nginx reverse-proxy/gateway + Kubernetes manifests.
docs/       BACKEND_STANDARDS.md — the standing rule above.
docker-compose.yml   production-shaped local stack (nginx+frontend+backend+worker+pg+redis).
```

## Run

```bash
# MVP (default, zero external services)
cd backend && pip install -r requirements.txt && python manage.py migrate && python manage.py seed_demo
python manage.py runserver 8000            # + worker: python manage.py process_outbound
cd ../frontend && npm install && npm run build && npm run start

# Production-shaped stack
docker compose up --build                  # → http://localhost:8080
```

Tiers: `DJANGO_ENV=mvp|demo|production`. Production requires `DJANGO_SECRET_KEY` +
`DJANGO_ALLOWED_HOSTS` and refuses to boot without them.
