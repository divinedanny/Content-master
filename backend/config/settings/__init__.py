"""
Tiered settings selector.

DJANGO_ENV picks the environment; defaults to the lightweight MVP tier so a
bare checkout runs with no external services.

    DJANGO_ENV=mvp | demo | production
"""

import os

_env = os.environ.get("DJANGO_ENV", "mvp").lower()

if _env == "production":
    from .production import *  # noqa: F401,F403
elif _env == "demo":
    from .demo import *  # noqa: F401,F403
else:
    from .mvp import *  # noqa: F401,F403
