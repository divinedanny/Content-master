"""
Stateless auth tokens.

Signed, expiring bearer tokens using Django's own signing (HMAC over
SECRET_KEY) — no external dependency, works in every tier. In production the
JWT stack (rest_framework_simplejwt, wired in settings/production.py) can sit
alongside these; the client treats both as `Authorization: Bearer <token>`.
"""

from __future__ import annotations

from django.core import signing

_SALT = "command-centre.auth"
DEFAULT_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


def issue_token(user) -> str:
    return signing.dumps({"uid": user.id}, salt=_SALT)


def verify_token(token: str, max_age: int = DEFAULT_MAX_AGE) -> int | None:
    """Return the user id for a valid token, else None."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=max_age)
        return int(data["uid"])
    except (signing.BadSignature, signing.SignatureExpired, KeyError, ValueError, TypeError):
        return None
