"""
Production tier — hardened.

Turns on the full stack: Postgres, Redis cache, enforced authentication
(JWT + API key) with RBAC/ABAC permissions, TLS/security headers, strict CORS,
and WhiteNoise static serving. Optional packages are enabled only when
installed (see requirements.txt production extras), so a partial rollout
degrades gracefully instead of crashing.

Required env in production: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS,
CORS_ALLOWED_ORIGINS, and a database (POSTGRES_*). Redis via REDIS_URL.
"""

import importlib.util
import os

from .base import *  # noqa: F401,F403
from .base import INSTALLED_APPS, MIDDLEWARE, REST_FRAMEWORK, env_list

ENVIRONMENT = "production"
DEBUG = False


def _installed(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


# -- fail loudly on insecure config ----------------------------------------

if SECRET_KEY == "dev-only-insecure-key":  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be set in production.")

# -- database: PostgreSQL ---------------------------------------------------

if os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
            "OPTIONS": {"sslmode": os.environ.get("POSTGRES_SSLMODE", "prefer")},
        }
    }

# -- cache: Redis -----------------------------------------------------------

REDIS_URL = os.environ.get("REDIS_URL")
if REDIS_URL and _installed("django_redis"):
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        }
    }

# -- websockets (Django Channels) ------------------------------------------

if _installed("channels"):
    INSTALLED_APPS = ["daphne", *INSTALLED_APPS]
    if REDIS_URL and _installed("channels_redis"):
        CHANNEL_LAYERS = {
            "default": {
                "BACKEND": "channels_redis.core.RedisChannelLayer",
                "CONFIG": {"hosts": [REDIS_URL]},
            }
        }

# -- static files (WhiteNoise) ---------------------------------------------

if _installed("whitenoise"):
    MIDDLEWARE = [
        MIDDLEWARE[0],  # CORS stays first
        "whitenoise.middleware.WhiteNoiseMiddleware",
        *MIDDLEWARE[1:],
    ]
    STORAGES = {
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

# -- TLS / security headers -------------------------------------------------
# Behind a TLS-terminating reverse proxy (nginx / ALB / Ingress), so trust the
# forwarded-proto header rather than terminating TLS in Django.

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(os.environ.get("HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# -- CORS / CSRF: strict allow-lists ---------------------------------------

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS") or CORS_ALLOWED_ORIGINS

# -- DRF: enforce authentication + RBAC/ABAC, tighter throttles ------------

_auth_classes = ["rest_framework.authentication.SessionAuthentication"]
if _installed("rest_framework_simplejwt"):
    _auth_classes.insert(0, "rest_framework_simplejwt.authentication.JWTAuthentication")
    INSTALLED_APPS = [*INSTALLED_APPS, "rest_framework_simplejwt"]
# API-key auth (no external dependency) is always available.
_auth_classes.append("core.security.APIKeyAuthentication")

REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] = _auth_classes
REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = ["core.security.IsAuthenticatedOrAPIKey"]
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": os.environ.get("THROTTLE_ANON", "30/min"),
    "user": os.environ.get("THROTTLE_USER", "300/min"),
}

# JWT lifetimes (used when simplejwt is installed).
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MIN", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}
