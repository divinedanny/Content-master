import os, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
c = Client()

# Every endpoint requires auth (base.py's DEFAULT_PERMISSION_CLASSES) — log
# in as the user seed_demo created and send the token on every request.
email = os.environ.get("DEMO_EMAIL", "demo@avionhub.ng")
password = os.environ.get("DEMO_PASSWORD", "demo1234")
login = c.post("/api/auth/login/", json.dumps({"email": email, "password": password}),
                content_type="application/json")
assert login.status_code == 200, f"login failed ({login.status_code}): {login.json()} — did you run seed_demo?"
auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['token']}"}

print("="*62)
print("ATTENTION DASHBOARD")
print("="*62)
d = c.get("/api/attention/", **auth).json()
print(f"Total unanswered : {d['total_unanswered']}")
print(f"Oldest wait      : {d['oldest_wait_label']}")
print(f"Median response  : {d['median_first_response_label']}")
print(f"Most neglected   : {d['most_neglected']['label']} ({d['most_neglected']['unanswered']} waiting)")
print()
print(f"{'CHANNEL':<16}{'UNANS':<7}{'RATE%':<8}{'MEDIAN':<9}{'OLDEST'}")
print("-"*62)
for ch in d['per_channel']:
    print(f"{ch['label']:<16}{ch['unanswered']:<7}{ch['answer_rate']:<8}{ch['median_response_label']:<9}{ch['oldest_label']}")
