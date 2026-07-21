"""
Authentication endpoints: register, login, logout, me, password reset,
change password, update profile.

Tokens are stateless signed bearer tokens (core/tokens.py). These endpoints
are open (AllowAny); everything else in the API requires authentication.
"""

import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.models import DEFAULT_NOTIFY_PREFS, Tenant, UserProfile
from core.tokens import issue_token

logger = logging.getLogger(__name__)
User = get_user_model()


def serialize_user(user) -> dict:
    profile = getattr(user, "profile", None)
    tenant = profile.tenant if profile else None
    return {
        "id": user.id,
        "name": (user.get_full_name() or user.username),
        "email": user.email,
        "tenant": {"id": tenant.id, "name": tenant.name} if tenant else None,
        "notify_prefs": (profile.notify_prefs if profile and profile.notify_prefs else DEFAULT_NOTIFY_PREFS),
    }


def _profile_for(user) -> UserProfile:
    profile, created = UserProfile.objects.get_or_create(
        user=user, defaults={"tenant": Tenant.objects.first(), "notify_prefs": DEFAULT_NOTIFY_PREFS},
    )
    if profile.tenant is None:
        profile.tenant = Tenant.objects.first()
        profile.save(update_fields=["tenant"])
    return profile


# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response({"error": "Email and password are required."}, status=400)
    if User.objects.filter(username=email).exists():
        return Response({"error": "An account with this email already exists."}, status=409)
    try:
        validate_password(password)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)

    user = User.objects.create_user(username=email, email=email, password=password)
    if name:
        user.first_name = name[:150]
        user.save(update_fields=["first_name"])
    _profile_for(user)  # attach to the demo tenant so data is visible

    return Response({"token": issue_token(user), "user": serialize_user(user)}, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    user = authenticate(username=email, password=password)
    if user is None:
        return Response({"error": "Invalid email or password."}, status=401)
    _profile_for(user)
    return Response({"token": issue_token(user), "user": serialize_user(user)})


@api_view(["POST"])
def logout(request):
    # Stateless tokens — the client discards it. (Endpoint kept for symmetry.)
    return Response({"status": "logged_out"})


@api_view(["GET"])
def me(request):
    return Response({"user": serialize_user(request.user)})


@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    email = (request.data.get("email") or "").strip().lower()
    user = User.objects.filter(username=email, is_active=True).first()
    payload = {"status": "If that email exists, a reset link has been sent."}

    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend = settings.CSRF_TRUSTED_ORIGINS[0] if settings.CSRF_TRUSTED_ORIGINS else "http://localhost:3000"
        link = f"{frontend}/reset-password?uid={uid}&token={token}"
        logger.info("Password reset for %s: %s", email, link)
        # No SMTP configured in demo — surface the link so it is testable.
        # In production, send this by email instead of returning it.
        if settings.DEBUG or getattr(settings, "ENVIRONMENT", "") in ("mvp", "demo"):
            payload["debug_reset_link"] = link
            payload["uid"] = uid
            payload["token"] = token
    return Response(payload)


@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    uid = request.data.get("uid") or ""
    token = request.data.get("token") or ""
    password = request.data.get("password") or ""
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return Response({"error": "Invalid reset link."}, status=400)
    if not default_token_generator.check_token(user, token):
        return Response({"error": "This reset link is invalid or has expired."}, status=400)
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"token": issue_token(user), "user": serialize_user(user)})


@api_view(["POST"])
def change_password(request):
    current = request.data.get("current_password") or ""
    new = request.data.get("new_password") or ""
    if not request.user.check_password(current):
        return Response({"error": "Current password is incorrect."}, status=400)
    try:
        validate_password(new, request.user)
    except ValidationError as exc:
        return Response({"error": " ".join(exc.messages)}, status=400)
    request.user.set_password(new)
    request.user.save(update_fields=["password"])
    return Response({"token": issue_token(request.user), "status": "password_changed"})


@api_view(["PATCH"])
def update_profile(request):
    user = request.user
    if "name" in request.data:
        user.first_name = (request.data.get("name") or "")[:150]
    if "email" in request.data:
        new_email = (request.data.get("email") or "").strip().lower()
        if new_email and new_email != user.email:
            if User.objects.filter(username=new_email).exclude(pk=user.pk).exists():
                return Response({"error": "That email is already in use."}, status=409)
            user.email = new_email
            user.username = new_email
    user.save()
    return Response({"user": serialize_user(user)})
