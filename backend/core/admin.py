from django.contrib import admin

from core.models import ChannelConnection


@admin.register(ChannelConnection)
class ChannelConnectionAdmin(admin.ModelAdmin):
    """
    Where a channel moves from MockAdapter to a real one: flip `is_mock` off
    and paste real credentials into `oauth_tokens`
    (e.g. {"access_token": ..., "phone_number_id": ..., "waba_id": ...} for
    WhatsApp — see core/adapters/whatsapp.py / .env.example).
    """
    list_display = ["tenant", "channel", "is_mock", "status", "last_synced_at"]
    list_filter = ["channel", "is_mock", "status"]
    search_fields = ["display_name", "handle", "external_account_id"]
