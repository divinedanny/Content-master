"""
OAuth 2.0 provider configs for connecting a tenant's real social accounts.

WhatsApp is deliberately absent — it authenticates via a long-lived system
-user token (see core/adapters/whatsapp.py), not per-user OAuth. These six
are the platforms a person actually signs into: Facebook, Instagram, X,
LinkedIn, Google (Business Profile, for review replies) and TikTok.

Same env-driven philosophy as WhatsAppConfig/MonnifyConfig: a provider only
counts as `is_configured()` once real credentials are in .env, and nothing
above this module (views, Settings UI) needs to change when they land.

Each platform's OAuth dialect differs in real, unavoidable ways — PKCE vs
not, HTTP Basic vs body client auth, `client_id` vs `client_key`, and where
the account id/name live in the identity response — so `OAuthProvider` is a
thin, override-friendly shape rather than a one-size engine.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlencode

import requests

from core.models import Channel


@dataclass(frozen=True)
class OAuthProvider:
    channel: str
    label: str

    client_id_env: str
    client_secret_env: str
    authorize_url: str
    token_url: str
    scopes: list = field(default_factory=list)
    identity_url: str = ""
    identity_parser: Callable[[dict], dict] = lambda raw: {
        "id": raw.get("id", ""), "name": raw.get("name", ""), "handle": raw.get("name", ""),
    }

    # Quirks a handful of providers need.
    client_id_param: str = "client_id"          # TikTok calls it "client_key"
    scope_sep: str = " "                        # TikTok wants comma-separated
    uses_pkce: bool = False                     # X requires PKCE
    token_auth_style: str = "body"               # "body" | "basic" (X wants Basic auth)
    extra_authorize_params: dict = field(default_factory=dict)
    # Falls back to another provider's app when unset (Instagram usually
    # shares its Meta app with Facebook).
    client_id_env_fallback: str = ""
    client_secret_env_fallback: str = ""

    def client_id(self) -> str:
        return os.environ.get(self.client_id_env) or (
            os.environ.get(self.client_id_env_fallback, "") if self.client_id_env_fallback else ""
        )

    def client_secret(self) -> str:
        return os.environ.get(self.client_secret_env) or (
            os.environ.get(self.client_secret_env_fallback, "") if self.client_secret_env_fallback else ""
        )

    def is_configured(self) -> bool:
        return bool(self.client_id() and self.client_secret())

    def build_authorize_url(self, state: str, redirect_uri: str, code_challenge: str | None = None) -> str:
        params = {
            self.client_id_param: self.client_id(),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": self.scope_sep.join(self.scopes),
            "state": state,
            **self.extra_authorize_params,
        }
        if self.uses_pkce and code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        return f"{self.authorize_url}?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str, code_verifier: str | None = None) -> dict:
        body = {
            self.client_id_param: self.client_id(),
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        headers = {"Accept": "application/json"}
        if self.token_auth_style == "basic":
            basic = base64.b64encode(f"{self.client_id()}:{self.client_secret()}".encode()).decode()
            headers["Authorization"] = f"Basic {basic}"
        else:
            body["client_secret"] = self.client_secret()
        if code_verifier:
            body["code_verifier"] = code_verifier
        response = requests.post(self.token_url, data=body, headers=headers, timeout=20)
        response.raise_for_status()
        return response.json()

    def fetch_identity(self, access_token: str) -> dict:
        response = requests.get(
            self.identity_url, headers={"Authorization": f"Bearer {access_token}"}, timeout=20,
        )
        response.raise_for_status()
        return self.identity_parser(response.json())


PROVIDERS: dict[str, OAuthProvider] = {
    # Facebook + Instagram share one Meta app: both connect through Facebook
    # Login, and an Instagram professional account is only reachable via the
    # Facebook Page it's linked to. INSTAGRAM_CLIENT_ID/SECRET are optional —
    # unset, they fall back to the Facebook app.
    Channel.FACEBOOK: OAuthProvider(
        channel=Channel.FACEBOOK, label="Facebook",
        client_id_env="FACEBOOK_CLIENT_ID", client_secret_env="FACEBOOK_CLIENT_SECRET",
        authorize_url="https://www.facebook.com/v21.0/dialog/oauth",
        token_url="https://graph.facebook.com/v21.0/oauth/access_token",
        scopes=["pages_show_list", "pages_manage_engagement", "pages_messaging", "pages_read_engagement"],
        identity_url="https://graph.facebook.com/v21.0/me?fields=id,name",
        identity_parser=lambda raw: {"id": raw["id"], "name": raw.get("name", ""), "handle": raw.get("name", "")},
    ),
    Channel.INSTAGRAM: OAuthProvider(
        channel=Channel.INSTAGRAM, label="Instagram",
        client_id_env="INSTAGRAM_CLIENT_ID", client_secret_env="INSTAGRAM_CLIENT_SECRET",
        client_id_env_fallback="FACEBOOK_CLIENT_ID", client_secret_env_fallback="FACEBOOK_CLIENT_SECRET",
        authorize_url="https://www.facebook.com/v21.0/dialog/oauth",
        token_url="https://graph.facebook.com/v21.0/oauth/access_token",
        scopes=["instagram_basic", "instagram_manage_messages", "instagram_manage_comments", "pages_show_list"],
        identity_url="https://graph.facebook.com/v21.0/me?fields=id,name",
        identity_parser=lambda raw: {"id": raw["id"], "name": raw.get("name", ""), "handle": raw.get("name", "")},
    ),
    # X's OAuth 2.0 requires PKCE and authenticates the token exchange with
    # HTTP Basic (client_id:client_secret), not credentials in the body.
    Channel.X: OAuthProvider(
        channel=Channel.X, label="X",
        client_id_env="X_CLIENT_ID", client_secret_env="X_CLIENT_SECRET",
        authorize_url="https://twitter.com/i/oauth2/authorize",
        token_url="https://api.twitter.com/2/oauth2/token",
        scopes=["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "offline.access"],
        uses_pkce=True, token_auth_style="basic",
        identity_url="https://api.twitter.com/2/users/me",
        identity_parser=lambda raw: {
            "id": raw["data"]["id"],
            "name": raw["data"].get("name", ""),
            "handle": raw["data"].get("username", ""),
        },
    ),
    Channel.LINKEDIN: OAuthProvider(
        channel=Channel.LINKEDIN, label="LinkedIn",
        client_id_env="LINKEDIN_CLIENT_ID", client_secret_env="LINKEDIN_CLIENT_SECRET",
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        # OpenID Connect scopes (r_liteprofile/r_emailaddress are retired);
        # w_member_social is what lets Command Centre post/comment on the
        # member's behalf.
        scopes=["openid", "profile", "email", "w_member_social"],
        identity_url="https://api.linkedin.com/v2/userinfo",
        identity_parser=lambda raw: {
            "id": raw["sub"], "name": raw.get("name", ""), "handle": raw.get("email", raw.get("name", "")),
        },
    ),
    # Google Business Profile — the API behind owner replies to Google
    # Reviews. access_type=offline + prompt=consent are what actually get a
    # refresh_token back; without them Google only returns a short-lived one.
    Channel.GOOGLE: OAuthProvider(
        channel=Channel.GOOGLE, label="Google",
        client_id_env="GOOGLE_CLIENT_ID", client_secret_env="GOOGLE_CLIENT_SECRET",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        scopes=["openid", "email", "profile", "https://www.googleapis.com/auth/business.manage"],
        extra_authorize_params={"access_type": "offline", "prompt": "consent"},
        identity_url="https://openidconnect.googleapis.com/v1/userinfo",
        identity_parser=lambda raw: {"id": raw["sub"], "name": raw.get("name", ""), "handle": raw.get("email", "")},
    ),
    # TikTok's Login Kit calls the app id "client_key" (not "client_id") and
    # wants comma-separated scopes — everything else follows the same shape.
    Channel.TIKTOK: OAuthProvider(
        channel=Channel.TIKTOK, label="TikTok",
        client_id_env="TIKTOK_CLIENT_KEY", client_secret_env="TIKTOK_CLIENT_SECRET",
        client_id_param="client_key", scope_sep=",",
        authorize_url="https://www.tiktok.com/v2/auth/authorize/",
        token_url="https://open.tiktokapis.com/v2/oauth/token/",
        scopes=["user.info.basic"],
        identity_url="https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        identity_parser=lambda raw: {
            "id": raw["data"]["user"]["open_id"],
            "name": raw["data"]["user"].get("display_name", ""),
            "handle": raw["data"]["user"].get("display_name", ""),
        },
    ),
}
