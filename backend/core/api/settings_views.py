"""
Settings endpoints: tenant (brand voice, quiet hours), notification
preferences, and channel connect/disconnect. All require authentication.
"""

from datetime import datetime

from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.adapters.base import CAPABILITIES
from core.models import (
    Channel, ChannelConnection, DEFAULT_NOTIFY_PREFS, Tenant, UserProfile,
)


def user_tenant(request) -> Tenant:
    profile = getattr(request.user, "profile", None)
    if profile and profile.tenant:
        return profile.tenant
    return Tenant.objects.first()


def _hm(t) -> str:
    return t.strftime("%H:%M") if t else ""


@api_view(["GET", "PATCH"])
def tenant_settings(request):
    tenant = user_tenant(request)
    if request.method == "PATCH":
        if "name" in request.data:
            tenant.name = request.data["name"][:200]
        if "brand_voice" in request.data:
            tenant.brand_voice = request.data["brand_voice"]
        if "timezone" in request.data:
            tenant.timezone = request.data["timezone"][:64]
        for field in ("quiet_hours_start", "quiet_hours_end"):
            if field in request.data and request.data[field]:
                try:
                    setattr(tenant, field, datetime.strptime(request.data[field], "%H:%M").time())
                except ValueError:
                    return Response({"error": f"{field} must be HH:MM"}, status=400)
        tenant.save()

    return Response({
        "name": tenant.name,
        "timezone": tenant.timezone,
        "brand_voice": tenant.brand_voice,
        "quiet_hours_start": _hm(tenant.quiet_hours_start),
        "quiet_hours_end": _hm(tenant.quiet_hours_end),
    })


@api_view(["GET", "PATCH"])
def notification_settings(request):
    profile, _ = UserProfile.objects.get_or_create(
        user=request.user, defaults={"tenant": Tenant.objects.first(), "notify_prefs": DEFAULT_NOTIFY_PREFS},
    )
    if request.method == "PATCH":
        prefs = request.data.get("notify_prefs")
        if isinstance(prefs, dict):
            profile.notify_prefs = prefs
            profile.save(update_fields=["notify_prefs"])
    return Response({"notify_prefs": profile.notify_prefs or DEFAULT_NOTIFY_PREFS})


@api_view(["POST"])
def channel_connect(request, channel):
    if channel not in CAPABILITIES:
        return Response({"error": "unknown channel"}, status=400)
    tenant = user_tenant(request)
    cap = CAPABILITIES[channel]
    conn, _ = ChannelConnection.objects.get_or_create(
        tenant=tenant, channel=channel,
        external_account_id=f"mock_{channel}_001",
        defaults={"display_name": cap.label, "handle": cap.label, "is_mock": True},
    )
    conn.status = "connected"
    conn.save(update_fields=["status"])
    return Response({"channel": channel, "connected": True})


@api_view(["POST"])
def channel_disconnect(request, channel):
    if channel not in CAPABILITIES:
        return Response({"error": "unknown channel"}, status=400)
    tenant = user_tenant(request)
    ChannelConnection.objects.filter(tenant=tenant, channel=channel).update(status="disconnected")
    return Response({"channel": channel, "connected": False})
