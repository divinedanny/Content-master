# Command Centre backend — production image.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_ENV=production

WORKDIR /app

# System deps for psycopg / building wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-prod.txt ./
RUN pip install -r requirements-prod.txt

COPY . .

# Run as a non-root user.
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Liveness probe target.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -fsS http://localhost:8000/healthz/ || exit 1

# gunicorn for HTTP; the outbound worker runs as a separate service (compose/k8s).
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "60", \
     "--access-logfile", "-"]
