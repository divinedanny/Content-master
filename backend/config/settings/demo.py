"""
Demo tier — the showcase environment.

Like MVP (seeded, open enough to click through freely) but a little closer to
production hygiene: real-ish rate limits so a shared demo link can't be hammered,
and CORS restricted to the demo origin when one is configured.
"""

from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK, env_bool, env_list

DEBUG = env_bool("DJANGO_DEBUG", True)
ENVIRONMENT = "demo"

# Flag the UI can read to show a "demo data" banner.
IS_DEMO = True

# Auth required; sane throttles for a shared demo link.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"anon": "300/min", "user": "600/min"}

# Restrict CORS to the demo origin if one is set; otherwise stay open so a
# throwaway tunnel URL still works.
_demo_origins = env_list("CORS_ALLOWED_ORIGINS")
if _demo_origins:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = _demo_origins
