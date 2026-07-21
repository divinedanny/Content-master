# Backend Engineering Standards

**This is a standing rule, not a suggestion.** Every backend built in (or modelled on) this
repository must address the concerns below, and must ship in three tiers — **MVP**, **Demo**,
**Production** — selected by a single environment switch. The point is that hardening is
*configuration*, prepared up front, never a rewrite bolted on later.

Tier is chosen with `DJANGO_ENV` (`mvp` | `demo` | `production`); settings live in
`backend/config/settings/{base,mvp,demo,production}.py`.

| Concern | MVP | Demo | Production |
|---|---|---|---|
| **Auth — JWT** | off (open API) | off | **enforced** (SimpleJWT access/refresh, rotation + blacklist) |
| **Auth — API keys** | off | off | **`X-API-Key`** for machine clients (`core/security.py`) |
| **RBAC** (roles) | — | — | **Django groups** via `HasRole(...)` |
| **ABAC** (attributes) | — | — | **`TenantScoped`** — tenant isolation at the permission layer |
| **Rate limiting** | generous | real limits | **strict** DRF throttles + nginx/Ingress edge limits |
| **Caching (Redis)** | LocMem | LocMem | **Redis** (`django_redis`) |
| **WebSockets** | — | — | **Channels + Redis** layer (ASGI/daphne), `/ws/` proxied |
| **CORS** | open | demo origin | **strict allow-list** from env |
| **SSL/TLS** | http | http | **HTTPS**, HSTS, secure cookies, proxy-terminated |
| **Reverse proxy / API gateway** | — | optional | **nginx** (compose) / **Ingress** (k8s) routes `/api`, `/webhooks`, `/ws` |
| **Load balancing** | — | — | nginx upstreams / k8s Service + **HPA** |
| **Database** | SQLite | SQLite | **PostgreSQL** (env-configured, `CONN_MAX_AGE`, SSL) |
| **DB indexing** | required from day one | " | " |
| **SQL injection** | ORM only, always | " | " |
| **Docker** | — | image builds | **compose stack** + per-service images |
| **Cloud / K8s** | — | — | manifests in `deploy/k8s/` (AWS EKS / GKE / AKS) |
| **Health checks** | `/healthz/` | `/healthz/` | probed by LB + k8s readiness/liveness |
| **Secrets** | `.env` | `.env` | env / k8s Secret / cloud secret manager — never in code |

## How each concern is met here

- **JWT / API keys / RBAC / ABAC** — `backend/core/security.py` provides `APIKeyAuthentication`,
  `IsAuthenticatedOrAPIKey`, `HasRole(*roles)` (RBAC via groups) and `TenantScoped` (ABAC).
  Production wires JWT (`rest_framework_simplejwt`) + API keys as the default auth classes and
  flips the default permission to authenticated. MVP/Demo stay open so the UI needs no login.
- **Rate limiting** — DRF `AnonRateThrottle`/`UserRateThrottle` in every tier (backed by the cache),
  tightened toward production; nginx `limit_req` / Ingress `limit-rps` add an edge layer.
- **Caching** — `CACHES` is LocMem by default and Redis in production (`REDIS_URL`). Use it for
  hot reads and to back throttling; never cache per-tenant data without a tenant-scoped key.
- **WebSockets** — real-time inbox/notifications ride Django Channels over the Redis channel layer
  in production; `ASGI_APPLICATION` is set and nginx/Ingress upgrade `/ws/`.
- **Database integration & indexing** — models declare `db_index`/`Index`/`unique_together` for
  every lookup and dedupe path (see `Interaction`, `OutboundMessage`). Production runs PostgreSQL
  with pooled connections; SQLite is dev-only.
- **SQL injection** — always go through the Django ORM (parameterised). No f-strings/`%`-formatting
  into `.raw()`/`.extra()`/cursor SQL. If raw SQL is unavoidable, use params (`cursor.execute(sql,
  [args])`), never string interpolation.
- **CORS / CSRF** — open in MVP/Demo, strict env allow-lists in production; `CSRF_TRUSTED_ORIGINS`
  set for the browser origins.
- **SSL/TLS** — terminated at the reverse proxy; Django trusts `X-Forwarded-Proto`, forces HTTPS,
  sets HSTS and secure cookies in production.
- **Reverse proxy / API gateway / load balancing** — `deploy/nginx/nginx.conf` is one public
  entrypoint routing UI vs `/api` vs `/ws`, with upstream blocks for round-robin LB. In k8s the
  Ingress is the gateway/L7 LB and the Service + HPA handle pod-level balancing/scaling.
- **Docker** — `backend/Dockerfile` (gunicorn, non-root, healthcheck), `frontend/Dockerfile`
  (multi-stage), `docker-compose.yml` (nginx + frontend + backend + worker + postgres + redis).
- **Cloud (K8s / AWS / GCP / Azure)** — `deploy/k8s/` has Deployments, Service, HPA, Ingress and a
  Secret template; the images run unchanged on EKS / GKE / AKS. Use the cloud's managed Postgres and
  Redis and its secret manager.
- **System design** — adapters isolate external platforms behind one contract; a durable, idempotent
  outbound **queue** with a worker decouples "accepted" from "delivered"; the frontend is a single
  origin behind the gateway. Prefer async workers over in-request side effects; make every external
  call idempotent and retryable.
- **Git** — feature branches, small reviewable commits with clear messages, PRs before merge, secrets
  never committed (`.env`, `db.sqlite3`, `node_modules` are ignored).

## Definition of done for any new backend

1. Runs on `DJANGO_ENV=mvp` with zero external services.
2. Has a `production` tier that enforces auth, rate limiting, Redis, Postgres, TLS and strict CORS.
3. Ships a Dockerfile + compose entry and a `/healthz/` probe.
4. Every query path is indexed; every write path that can be retried is idempotent.
5. No raw string-interpolated SQL; no secret in the repo.
