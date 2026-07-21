import os, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
from core.models import PaymentTransaction, Subscription
c = Client()

# Every endpoint requires auth (base.py's DEFAULT_PERMISSION_CLASSES) — log
# in as the user seed_demo created and send the token on every request.
email = os.environ.get("DEMO_EMAIL", "demo@avionhub.ng")
password = os.environ.get("DEMO_PASSWORD", "demo1234")
login = c.post("/api/auth/login/", json.dumps({"email": email, "password": password}),
                content_type="application/json")
assert login.status_code == 200, f"login failed ({login.status_code}): {login.json()} — did you run seed_demo?"
auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['token']}"}

print("="*64); print("MONNIFY SUBSCRIPTION LIFECYCLE"); print("="*64)

s = c.get("/api/billing/subscription/", **auth).json()
print(f"BEFORE  tier={s['tier']}  status={s['status']}  entitled={s['is_entitled']}")
print(f"        days remaining on trial: {s['days_remaining']}")
print("\nAvailable tiers:")
for t in s["tiers"]:
    print(f"   {t['label']:<9} NGN {t['price_ngn']:>7,}/mo   channels={t['limits']['channels']}  seats={t['limits']['seats']}")

print("\n--- 1. INITIALIZE TRANSACTION ---")
r = c.post("/api/billing/checkout/", json.dumps({
    "tier":"growth","customer_name":"Avion Hub","customer_email":"billing@avionhub.ng"
}), content_type="application/json", **auth)
co = r.json()
print(f"  status        : {r.status_code}")
print(f"  reference     : {co['payment_reference']}")
print(f"  amount        : NGN {co['amount_ngn']:,.0f}")
print(f"  checkout_url  : {co['checkout_url']}")
print(f"  simulated     : {co['simulated']}  (no live sandbox creds loaded yet)")

print("\n--- 2. WEBHOOK: Transaction Completion (PAID) ---")
r2 = c.post("/api/billing/simulate-payment/", json.dumps({
    "payment_reference": co["payment_reference"], "payment_method":"CARD"
}), content_type="application/json", **auth)
print(f"  -> {r2.json()}")

print("\n--- 3. IDEMPOTENCY: replay the SAME webhook ---")
r3 = c.post("/api/billing/simulate-payment/", json.dumps({
    "payment_reference": co["payment_reference"], "payment_method":"CARD"
}), content_type="application/json", **auth)
print(f"  -> {r3.json()}")
print(f"  duplicate safely ignored: {r3.json().get('duplicate') is True}")

print("\n--- 4. SUBSCRIPTION AFTER PAYMENT ---")
s2 = c.get("/api/billing/subscription/", **auth).json()
print(f"  tier={s2['tier']}  status={s2['status']}  entitled={s2['is_entitled']}")
print(f"  amount=NGN {s2['amount_ngn']:,.0f}  renews in {s2['days_remaining']} days")
print(f"  limits: {s2['limits']}")

print("\n--- 5. RAW WEBHOOK ENDPOINT (what Monnify actually calls) ---")
payload = json.dumps({"eventType":"SUCCESSFUL_TRANSACTION","eventData":{
    "paymentReference":"UNKNOWN-REF-123","transactionReference":"MNFY|TEST",
    "paymentStatus":"PAID"}})
r4 = c.post("/webhooks/monnify/", payload, content_type="application/json")
print(f"  unknown reference -> {r4.status_code} {r4.json()}")
print(f"  (200 returned so Monnify does not retry into a poison loop)")

print(f"\n  PaymentTransaction rows: {PaymentTransaction.objects.count()}")
