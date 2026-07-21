"""
MVP tier — the fastest path to a running backend.

Bias: zero external services, open access, instant feedback. This is what a
solo developer or a competition build runs. SQLite, DEBUG on, generous rate
limits, no auth required.
"""

from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK

DEBUG = True
ENVIRONMENT = "mvp"

# Open API — no login needed for the demo frontend.
REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = ["rest_framework.permissions.AllowAny"]
# Generous throttles so local development never trips them.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"anon": "1000/min", "user": "2000/min"}
