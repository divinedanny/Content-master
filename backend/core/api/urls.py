"""API routes."""
from django.urls import path

from core.api import views

urlpatterns = [
    path("channels/", views.channels, name="channels"),
    path("attention/", views.attention, name="attention"),
    path("inbox/", views.inbox, name="inbox"),
    path("inbox/<int:interaction_id>/thread/", views.thread, name="thread"),
    path("inbox/<int:interaction_id>/approve/", views.approve_draft, name="approve"),
    path("posts/", views.posts, name="posts"),
    path("analytics/", views.analytics, name="analytics"),
    path("billing/subscription/", views.subscription, name="subscription"),
    path("billing/checkout/", views.checkout, name="checkout"),
    path("billing/simulate-payment/", views.simulate_payment, name="simulate_payment"),
]
