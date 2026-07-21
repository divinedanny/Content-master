"""
Outbound queue worker.

Drains the durable outbound message queue, retrying deliveries whose backoff
has elapsed. Run it as a long-lived process in production (systemd, a
container, or a supervisor):

    python manage.py process_outbound            # loop forever, 5s tick
    python manage.py process_outbound --once     # single pass (for cron)
    python manage.py process_outbound --interval 2

This is the piece that guarantees a message composed during a network outage
is delivered once connectivity returns — without it being sent twice.
"""

import time

from django.core.management.base import BaseCommand

from core import outbound as outbound_service


class Command(BaseCommand):
    help = "Deliver queued outbound messages, retrying with backoff."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run a single pass and exit.")
        parser.add_argument("--interval", type=float, default=5.0, help="Seconds between passes.")

    def handle(self, *args, **options):
        once = options["once"]
        interval = options["interval"]

        if once:
            summary = outbound_service.process_due()
            self.stdout.write(self.style.SUCCESS(f"Outbound pass: {summary}"))
            return

        self.stdout.write(f"Outbound worker started (tick {interval}s). Ctrl-C to stop.")
        try:
            while True:
                summary = outbound_service.process_due()
                if summary["processed"]:
                    self.stdout.write(f"  {summary}")
                time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write("\nOutbound worker stopped.")
