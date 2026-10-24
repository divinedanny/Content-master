#!/bin/sh
# Boot the single-container demo: migrate + seed, then API, worker, frontend.
set -e

cd /app/backend
python manage.py migrate --noinput
python manage.py seed_demo

gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 \
    --timeout 60 --access-logfile - &
python manage.py process_outbound &

cd /app/frontend
exec npx next start -H 0.0.0.0 -p "${PORT:-10000}"
