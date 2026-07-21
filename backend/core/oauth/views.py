"""
OAuth connect flow — lets a signed-in user link Command Centre to their
*real* account on Facebook, Instagram, X, LinkedIn, Google or TikTok.

Two hops, both under /api/oauth/<channel>/:

  start/     authenticated (bearer token). Returns {authorize_url} for the
             frontend to navigate the browser to — it can't just redirect
             from here, because this call carries the caller's bearer
             token and a 302 response doesn't cross that into the
             follow-up request the browser makes to the provider.

  callback/  hit directly by the provider's own redirect. No bearer token
             arrives with it, so the caller is identified from the signed
             `state` string minted in start/ instead (same pattern as
             core/tokens.py, its own salt/namespace).

This sits alongside the existing mock channel_connect/disconnect in
core/api/settings_views.py, not in place of it: a channel with no real
credentials configured keeps using the instant mock connect so the demo
still works out of the box. See PROVIDERS[channel].is_configured().
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets

import requests
from django.core import signing
from django.http import HttpResponseRedirect
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.models import Channel, ChannelConnection, Tenant
from core.oauth.providers import PROVIDERS
from core.adapters.whatsapp import WhatsAppConfig

logger = logging.getLogger(__name__)

_STATE_SALT = "command-centre.oauth-state"
_STATE_MAX_AGE = 60 * 10  # 10 minutes — plenty for a live redirect round trip


def _public_app_url() -> str:
    return os.environ.get("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")


def _redirect_uri(channel: str) -> str:
    # Must match, character for character, what's registered in each
    # platform's developer console.
    return f"{_public_app_url()}/api/oauth/{channel}/callback/"


@api_view(["GET"])
def oauth_start(request, channel):
    provider = PROVIDERS.get(channel)
    if provider is None:
        return Response({"error": "unknown channel"}, status=400)
    if not provider.is_configured():
        return Response(
            {
                "error": (
                    f"{provider.label} isn't configured yet. Ask an admin to set "
                    f"{provider.client_id_env} and {provider.client_secret_env} in .env."
                ),
            },
            status=409,
        )

    profile = getattr(request.user, "profile", None)
    tenant = profile.tenant if profile and profile.tenant else Tenant.objects.first()

    code_verifier = secrets.token_urlsafe(64) if provider.uses_pkce else ""
    state = signing.dumps(
        {"tenant_id": tenant.id, "channel": channel, "cv": code_verifier, "n": secrets.token_hex(8)},
        salt=_STATE_SALT,
    )
    code_challenge = None
    if provider.uses_pkce:
        digest = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()

    url = provider.build_authorize_url(
        state=state, redirect_uri=_redirect_uri(channel), code_challenge=code_challenge,
    )
    return Response({"authorize_url": url})


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_callback(request, channel):
    app_url = _public_app_url()
    provider = PROVIDERS.get(channel)
    if provider is None:
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error=unknown_channel")

    provider_error = request.GET.get("error") or request.GET.get("error_description")
    if provider_error:
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error={provider_error}")

    code = request.GET.get("code")
    raw_state = request.GET.get("state", "")
    try:
        state = signing.loads(raw_state, salt=_STATE_SALT, max_age=_STATE_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired):
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error=invalid_state")
    if state.get("channel") != channel or not code:
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error=invalid_state")

    try:
        tenant = Tenant.objects.get(id=state["tenant_id"])
        tokens = provider.exchange_code(
            code=code, redirect_uri=_redirect_uri(channel), code_verifier=state.get("cv") or None,
        )
        identity = provider.fetch_identity(tokens["access_token"])
    except Tenant.DoesNotExist:
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error=invalid_state")
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("%s OAuth exchange failed: %s", channel, exc)
        return HttpResponseRedirect(f"{app_url}/settings?oauth_error=exchange_failed")

    ChannelConnection.objects.update_or_create(
        tenant=tenant, channel=channel, external_account_id=identity["id"],
        defaults={
            "display_name": identity.get("name") or provider.label,
            "handle": identity.get("handle") or identity.get("name", ""),
            "oauth_tokens": tokens,
            "scopes": list(provider.scopes),
            "status": "connected",
            "is_mock": False,
        },
    )
    return HttpResponseRedirect(f"{app_url}/settings?connected={channel}")


# ---------------------------------------------------------------------------
# WhatsApp Embedded Signup — a popup (Facebook JS SDK's FB.login), not a
# redirect, so unlike the flow above it never leaves the Settings page.
# The frontend calls FB.login(config_id=...), gets back an auth `code`, and
# — from window `message` events Meta fires during the popup — the
# waba_id/phone_number_id of the number the user just picked or created. All
# three arrive here in one POST; only then do we talk to Meta.
# ---------------------------------------------------------------------------

@api_view(["POST"])
def whatsapp_embedded_signup(request):
    if not WhatsAppConfig.embedded_signup_configured():
        return Response(
            {
                "error": (
                    "WhatsApp Embedded Signup isn't configured. Ask an admin to set "
                    "WHATSAPP_APP_ID, WHATSAPP_CONFIG_ID and WHATSAPP_APP_SECRET in .env."
                ),
            },
            status=409,
        )

    code = request.data.get("code")
    waba_id = request.data.get("waba_id")
    phone_number_id = request.data.get("phone_number_id")
    if not code or not waba_id or not phone_number_id:
        return Response({"error": "missing code, waba_id or phone_number_id"}, status=400)

    profile = getattr(request.user, "profile", None)
    tenant = profile.tenant if profile and profile.tenant else Tenant.objects.first()

    graph = f"{WhatsAppConfig.GRAPH_BASE_URL}/{WhatsAppConfig.GRAPH_API_VERSION}"
    try:
        # Exchange the popup's short-lived code for an access token scoped to
        # the assets (this WABA/number) the user granted in the popup.
        token_resp = requests.get(
            f"{graph}/oauth/access_token",
            params={
                "client_id": WhatsAppConfig.APP_ID,
                "client_secret": WhatsAppConfig.APP_SECRET,
                "code": code,
            },
            timeout=20,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        # Subscribe this Meta app to the WABA's webhooks, so messages sent to
        # the tenant's number start arriving at /webhooks/whatsapp/.
        requests.post(f"{graph}/{waba_id}/subscribed_apps", headers=headers, timeout=20).raise_for_status()

        # Register the number for Cloud API messaging. Already-registered
        # numbers (e.g. reconnecting) 4xx here — that's not fatal, so it's
        # logged and swallowed rather than failing the whole connect.
        register = requests.post(
            f"{graph}/{phone_number_id}/register",
            json={"messaging_product": "whatsapp"}, headers=headers, timeout=20,
        )
        if not register.ok:
            logger.info(
                "WhatsApp phone register for %s returned %s (often already-registered, non-fatal): %s",
                phone_number_id, register.status_code, register.text,
            )

        identity_resp = requests.get(
            f"{graph}/{phone_number_id}",
            params={"fields": "display_phone_number,verified_name"}, headers=headers, timeout=20,
        )
        identity_resp.raise_for_status()
        identity = identity_resp.json()
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("WhatsApp embedded signup failed: %s", exc)
        return Response({"error": "Could not complete the WhatsApp connection. Please try again."}, status=502)

    conn, _ = ChannelConnection.objects.update_or_create(
        tenant=tenant, channel=Channel.WHATSAPP, external_account_id=phone_number_id,
        defaults={
            "display_name": identity.get("verified_name") or "WhatsApp",
            "handle": identity.get("display_phone_number", ""),
            "oauth_tokens": {
                "access_token": access_token, "phone_number_id": phone_number_id, "waba_id": waba_id,
            },
            "scopes": ["whatsapp_business_messaging", "whatsapp_business_management"],
            "status": "connected",
            "is_mock": False,
        },
    )
    return Response({"channel": "whatsapp", "connected": True, "handle": conn.handle})
