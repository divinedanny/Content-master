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

from core.models import ChannelConnection, Tenant
from core.oauth.providers import PROVIDERS

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
