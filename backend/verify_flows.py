import sys; sys.path.insert(0, "/home/claude/command-centre")
import os, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
c = Client()

print("="*64)
print("1. UNIFIED INBOX  (channel=all, kind=message)")
print("="*64)
items = c.get("/api/inbox/?channel=all&kind=message&unanswered=true").json()
print(f"{len(items)} unanswered messages across all platforms\n")
for i in items[:5]:
    d = "AI draft ready" if i["draft"] else "no draft"
    esc = " [ESCALATION]" if i["draft"] and i["draft"]["requires_escalation"] else ""
    print(f"  [{i['channel_label']:<10}] {i['author']['display_name']:<20} waiting {i['waiting_label']:<8} {d}{esc}")

print("\n" + "="*64)
print("2. PER-PLATFORM TAB FILTER  (channel=instagram)")
print("="*64)
ig = c.get("/api/inbox/?channel=instagram&kind=message").json()
print(f"Instagram tab -> {len(ig)} conversations")

print("\n" + "="*64)
print("3. LINKEDIN DM WALL  (honest platform constraint)")
print("="*64)
chans = c.get("/api/channels/").json()
li = [x for x in chans if x["channel"]=="linkedin"][0]
print(f"  supports_dm      : {li['supports_dm']}")
print(f"  constraint       : {li['constraint_note'][:70]}...")

print("\n" + "="*64)
print("4. APPROVAL GATE  (approve an AI draft -> native send)")
print("="*64)
target = [i for i in items if i["channel"]=="instagram" and i["draft"]][0]
print(f"  Customer : {target['author']['display_name']} on {target['channel_label']}")
print(f"  Message  : {target['body'][:60]}...")
print(f"  AI draft : {target['draft']['text'][:70]}...")
print(f"  Confidence: {target['draft']['confidence']}")
r = c.post(f"/api/inbox/{target['id']}/approve/",
           json.dumps({"decision":"approve"}), content_type="application/json")
print(f"  -> {r.status_code}  {r.json()}")

print("\n" + "="*64)
print("5. ATTENTION LEAK AFTER REPLY")
print("="*64)
d2 = c.get("/api/attention/").json()
print(f"  Total unanswered now: {d2['total_unanswered']} (was 37)")
