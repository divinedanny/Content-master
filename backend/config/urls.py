from django.contrib import admin
from django.urls import include, path

from core.api import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.api.urls")),
    # Monnify posts here. Register this URL in the Monnify dashboard under
    # Developer -> Webhook URLs -> Transaction Completion.
    path("webhooks/monnify/", views.monnify_webhook, name="monnify_webhook"),
]
