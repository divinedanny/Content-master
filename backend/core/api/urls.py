"""API routes."""
from django.urls import path

from core.api import auth_views, settings_views, views
from core.oauth import views as oauth_views

urlpatterns = [
    # -- auth --
    path("auth/register/", auth_views.register, name="register"),
    path("auth/login/", auth_views.login, name="login"),
    path("auth/logout/", auth_views.logout, name="logout"),
    path("auth/me/", auth_views.me, name="me"),
    path("auth/password/reset/", auth_views.request_password_reset, name="password_reset"),
    path("auth/password/reset/confirm/", auth_views.confirm_password_reset, name="password_reset_confirm"),
    path("auth/password/change/", auth_views.change_password, name="password_change"),
    path("auth/profile/", auth_views.update_profile, name="update_profile"),
    # -- settings --
    path("settings/tenant/", settings_views.tenant_settings, name="tenant_settings"),
    path("settings/notifications/", settings_views.notification_settings, name="notification_settings"),
    path("channels/<str:channel>/connect/", settings_views.channel_connect, name="channel_connect"),
    path("channels/<str:channel>/disconnect/", settings_views.channel_disconnect, name="channel_disconnect"),
    # -- oauth: connect a tenant's real account on a platform --
    path("oauth/<str:channel>/start/", oauth_views.oauth_start, name="oauth_start"),
    path("oauth/<str:channel>/callback/", oauth_views.oauth_callback, name="oauth_callback"),
    path("whatsapp/embedded-signup/", oauth_views.whatsapp_embedded_signup, name="whatsapp_embedded_signup"),
]

urlpatterns += [
    path("channels/", views.channels, name="channels"),
    path("attention/", views.attention, name="attention"),
    path("inbox/", views.inbox, name="inbox"),
    path("inbox/<int:interaction_id>/thread/", views.thread, name="thread"),
    path("inbox/<int:interaction_id>/approve/", views.approve_draft, name="approve"),
    path("outbound/", views.outbound, name="outbound"),
    path("outbound/process/", views.outbound_process, name="outbound_process"),
    path("posts/", views.posts, name="posts"),
    path("analytics/", views.analytics, name="analytics"),
    path("billing/subscription/", views.subscription, name="subscription"),
    path("billing/checkout/", views.checkout, name="checkout"),
    path("billing/simulate-payment/", views.simulate_payment, name="simulate_payment"),
]
