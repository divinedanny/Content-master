from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from core.api import views


def healthz(request):
    """Liveness/readiness probe for load balancers and Kubernetes."""
    from django.conf import settings
    return JsonResponse({"status": "ok", "environment": getattr(settings, "ENVIRONMENT", "unknown")})


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("admin/", admin.site.urls),
    path("api/", include("core.api.urls")),
    # Monnify posts here. Register this URL in the Monnify dashboard under
    # Developer -> Webhook URLs -> Transaction Completion.
    path("webhooks/monnify/", views.monnify_webhook, name="monnify_webhook"),
]
