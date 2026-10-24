# Command Centre — single-container image for a hosted test/demo instance
# (e.g. one Render web service). Runs the Django API, the outbound worker and
# the Next.js frontend in one container; only the frontend port is exposed and
# it proxies /api + /webhooks to Django (next.config.mjs).
#
# Demo tier: SQLite, seeded on every boot, so each deploy/restart starts from a
# clean dataset. For a real deployment use docker-compose.yml or deploy/k8s.

FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DJANGO_ENV=demo \
    BACKEND_ORIGIN=http://127.0.0.1:8000
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv curl \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt gunicorn
COPY backend/ ./

WORKDIR /app/frontend
COPY --from=frontend /app/package.json /app/next.config.mjs ./
COPY --from=frontend /app/node_modules ./node_modules
COPY --from=frontend /app/.next ./.next
COPY --from=frontend /app/public ./public

COPY deploy/render/start.sh /app/start.sh
RUN chmod +x /app/start.sh && useradd -m appuser && chown -R appuser /app
USER appuser

ENV PORT=10000
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz/ || exit 1
CMD ["/app/start.sh"]
