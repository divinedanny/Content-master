"""
Authentication & authorization building blocks for the production tier.

- APIKeyAuthentication  — machine-to-machine access via an X-API-Key header.
- IsAuthenticatedOrAPIKey — permission that accepts a logged-in user (JWT /
  session) OR a valid API key.
- HasRole                — RBAC: role-based access using Django groups.
- TenantScoped           — ABAC: attribute-based access enforcing that a user
  may only touch objects belonging to their own tenant (BR-07 isolation).

JWT itself is provided by rest_framework_simplejwt (wired in production
settings when installed); this module is the dependency-free complement.
"""

from __future__ import annotations

import os

from rest_framework import authentication, exceptions, permissions


class BearerTokenAuthentication(authentication.BaseAuthentication):
    """
    Authenticate a user from a signed bearer token (see core/tokens.py).

    Header: Authorization: Bearer <token>
    """

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header[len("Bearer "):].strip()

        from django.contrib.auth import get_user_model
        from core.tokens import verify_token

        uid = verify_token(token)
        if uid is None:
            raise exceptions.AuthenticationFailed("Invalid or expired token.")
        try:
            user = get_user_model().objects.get(id=uid, is_active=True)
        except get_user_model().DoesNotExist:
            raise exceptions.AuthenticationFailed("User not found.")
        return (user, token)


class ServiceAccount:
    """A non-DB principal representing an authenticated API-key caller."""

    is_authenticated = True
    is_active = True
    is_staff = False

    def __init__(self, key_id: str):
        self.username = f"service:{key_id}"
        self.key_id = key_id

    def __str__(self):
        return self.username


def _valid_api_keys() -> set[str]:
    return {k.strip() for k in os.environ.get("API_KEYS", "").split(",") if k.strip()}


class APIKeyAuthentication(authentication.BaseAuthentication):
    """Authenticate machine clients presenting a shared secret in X-API-Key."""

    keyword = "X-API-Key"

    def authenticate(self, request):
        provided = request.headers.get(self.keyword)
        if not provided:
            return None  # fall through to other authenticators
        keys = _valid_api_keys()
        if provided not in keys:
            raise exceptions.AuthenticationFailed("Invalid API key.")
        # Identify the key by a short, non-secret prefix for audit logs.
        return (ServiceAccount(provided[:6]), provided)


class IsAuthenticatedOrAPIKey(permissions.BasePermission):
    """Allow a logged-in user (JWT/session) or a validated API key."""

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool((user and user.is_authenticated) or request.auth)


def HasRole(*roles: str):
    """
    RBAC permission factory. Usage on a view:

        permission_classes = [HasRole("owner", "agent")]

    Superusers always pass; API-key service accounts are treated as trusted.
    """

    class _HasRole(permissions.BasePermission):
        def has_permission(self, request, view):
            user = getattr(request, "user", None)
            if not user or not user.is_authenticated:
                return False
            if getattr(user, "is_superuser", False) or isinstance(user, ServiceAccount):
                return True
            return user.groups.filter(name__in=roles).exists()

    return _HasRole


class TenantScoped(permissions.BasePermission):
    """
    ABAC: a user may only act on objects whose `tenant` matches their own.

    Enforces tenant isolation at the permission layer in addition to the
    queryset layer. Expects request.user to carry a `tenant_id` attribute
    (e.g. via a profile) and objects to expose `tenant_id`.
    """

    def has_object_permission(self, request, view, obj):
        user = getattr(request, "user", None)
        if isinstance(user, ServiceAccount) or getattr(user, "is_superuser", False):
            return True
        user_tenant = getattr(user, "tenant_id", None)
        obj_tenant = getattr(obj, "tenant_id", None)
        return user_tenant is not None and user_tenant == obj_tenant
