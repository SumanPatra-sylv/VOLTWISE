"""
Quick script: Insert a peak savings notification for the logged-in user's
AC + Washing Machine, and fix Refrigerator showing 0W.

Run from backend/:
  python insert_demo_notification.py
"""

import os, sys
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

db = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Find your user (Suman Patra / consumer_number 100100100101) ──
profile = db.table("profiles").select("id, name, consumer_number").eq(
    "consumer_number", "100100100101"
).limit(1).execute()

if not profile.data:
    print("ERROR: Consumer 100100100101 not found in profiles")
    sys.exit(1)

user_id = profile.data[0]["id"]
user_name = profile.data[0]["name"]
print(f"Found user: {user_name} ({user_id})")

# ── Find the home ──
home = db.table("homes").select("id").eq("user_id", user_id).eq("is_primary", True).limit(1).execute()
if not home.data:
    print("ERROR: No primary home found")
    sys.exit(1)

home_id = home.data[0]["id"]
print(f"Home: {home_id}")

# ── Find AC and Washing Machine appliances ──
appliances = db.table("appliances").select("id, name, rated_power_w, category").eq(
    "home_id", home_id
).eq("is_active", True).in_("category", ["ac", "washing_machine"]).execute()

if not appliances.data:
    print("ERROR: No AC or Washing Machine found")
    sys.exit(1)

app_ids = [a["id"] for a in appliances.data]
app_names = [a["name"] for a in appliances.data]
total_wattage = sum(a["rated_power_w"] for a in appliances.data)

print(f"Found appliances: {app_names} (total {total_wattage}W)")

# ── Calculate savings ──
peak_rate = 9.55
off_peak_rate = 6.31
rate_diff = peak_rate - off_peak_rate
savings_per_hour = round((total_wattage / 1000) * rate_diff, 2)
peak_duration = 4  # 18:00 - 22:00
total_savings = round(savings_per_hour * peak_duration, 0)

names_str = ", ".join(app_names)

# ── Set notification time to today 6:00 PM IST ──
IST = timezone(timedelta(hours=5, minutes=30))
today = datetime.now(IST).date()
notif_time = datetime(today.year, today.month, today.day, 18, 0, 0, tzinfo=IST)

# ── Insert the notification ──
notif = db.table("notifications").insert({
    "user_id": user_id,
    "type": "peak",
    "title": f"🔥 {len(appliances.data)} appliance{'s' if len(appliances.data) > 1 else ''} running during peak tariff",
    "message": (
        f"{names_str} running during high tariff period "
        f"(₹{peak_rate}/kWh). Tap to save up to ₹{total_savings:.0f} this peak window."
    ),
    "icon": "alert-triangle",
    "color": "text-amber-600",
    "bg_color": "bg-amber-50",
    "is_read": False,
    "created_at": notif_time.isoformat(),
    "metadata": {
        "subtype": "peak_savings_alert",
        "action": "navigate_optimizer",
        "appliance_ids": app_ids,
        "appliance_names": app_names,
        "savings_per_hour": savings_per_hour,
        "total_potential_savings": total_savings,
        "peak_rate": peak_rate,
        "off_peak_rate": off_peak_rate,
    },
}).execute()

print(f"✅ Notification inserted: {len(appliances.data)} appliances, save ₹{total_savings:.0f}")

# ── Fix Refrigerator: set current_power_w to realistic value ──
fridge = db.table("appliances").select("id, name, rated_power_w, current_power_w, status").eq(
    "home_id", home_id
).eq("is_active", True).eq("category", "refrigerator").execute()

if fridge.data:
    for f in fridge.data:
        # Refrigerators run at ~60-80% of rated when compressor is cycling
        realistic_power = round(f["rated_power_w"] * 0.72, 1)
        db.table("appliances").update({
            "current_power_w": realistic_power,
            "status": "ON",
        }).eq("id", f["id"]).execute()
        print(f"✅ Fixed {f['name']}: current_power_w {f['current_power_w']} → {realistic_power}W, status → ON")
else:
    print("⚠️  No refrigerator found in this home")

print("\nDone! Refresh the app to see changes.")
