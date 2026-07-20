import sys; sys.path.insert(0, "/home/claude/command-centre")
import os, django, json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
c = Client()

print("="*62)
print("ATTENTION DASHBOARD")
print("="*62)
d = c.get("/api/attention/").json()
print(f"Total unanswered : {d['total_unanswered']}")
print(f"Oldest wait      : {d['oldest_wait_label']}")
print(f"Median response  : {d['median_first_response_label']}")
print(f"Most neglected   : {d['most_neglected']['label']} ({d['most_neglected']['unanswered']} waiting)")
print()
print(f"{'CHANNEL':<16}{'UNANS':<7}{'RATE%':<8}{'MEDIAN':<9}{'OLDEST'}")
print("-"*62)
for ch in d['per_channel']:
    print(f"{ch['label']:<16}{ch['unanswered']:<7}{ch['answer_rate']:<8}{ch['median_response_label']:<9}{ch['oldest_label']}")
