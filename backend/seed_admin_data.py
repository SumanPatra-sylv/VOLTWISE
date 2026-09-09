"""
VoltWise — Admin Seed Data Generator (v2)
==========================================
Seeds 50 consumers with full data chain for the admin dashboard.

PREREQUISITES:
  1. Run 17_admin_seed_prep.sql in Supabase SQL Editor first
  2. Ensure .env has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

WHAT IT CREATES:
  - 50 auth users (via Admin API) + profiles
  - 50 homes (varied areas, linked to SBPDCL/MGVCL tariff plans)
  - 50 meters (40 online, 3 zero-consumption, 3 spike, 3 offline, 1 dormant)
  - 300+ recharges (6 months, modal around ₹500)
  - 200+ complaints (varied types, statuses, priorities)
  - 300+ appliances (5-8 per home)
  - 6 months of daily_aggregates (~9,000 rows)
  - 30 days of meter_readings (~144,000 rows at 15-min intervals)
  - Carbon stats, bills, schedules, recommendations

IDEMPOTENT:
  - Checks for existing seed users before creating
  - Uses upsert for profiles to guarantee rows exist
  - Uses ON CONFLICT-safe batch inserts

REAL USER SAFETY:
  - All seed users use @voltwise.local emails — no conflict with real users
  - All seed profiles tagged with location='SEED_DATA'
  - Consumer numbers from consumer_master — already-linked numbers
    are skipped (separate from auth-user-created profiles)

RUN:
  cd backend
  pip install python-dotenv supabase
  python seed_admin_data.py
"""

import os
import sys
import random
import math
from datetime import datetime, timedelta, date, time, timezone
from decimal import Decimal
from uuid import uuid4, UUID
import json

# Load env
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# IST timezone (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Seed password (all seed users share this — for admin analytics, not login)
SEED_PASSWORD = "SeedUser@VoltWise2026!"

# Fixed UUIDs from 04_seed_tariffs.sql (discom IDs use hex-valid 'd')
SBPDCL_DISCOM_ID = "d1000000-0000-0000-0000-000000000001"
MGVCL_DISCOM_ID  = "d1000000-0000-0000-0000-000000000002"

# Tariff plan IDs will be looked up dynamically from the database
# (04_seed_tariffs.sql comments say p1000000-... but 'p' is not hex)
SBPDCL_PLAN_ID = None  # Set dynamically in main()
MGVCL_PLAN_ID  = None  # Set dynamically in main()

# ── Consumer data from consumer_master ──────────────────────────
# 50 consumers (25 SBPDCL Bihar + 25 MGVCL Gujarat)
# Special roles:
#   0-2:   Power users   (high recharges, high usage)
#   3-5:   Dormant users (few recharges, low usage)
#   6-8:   Zero-consumption meters (readings with kwh_delta ≈ 0)
#   9-11:  Spike meters   (sudden 2-4× usage increase in last 7 days)
#   47-49: Offline meters (no readings in 30+ days)

CONSUMERS = [
    # (consumer_number, name, discom, state, meter_number, sanctioned_load_kw)
    # ═══ SBPDCL — Bihar ═══
    ("100100100101", "Suman Patra",       "SBPDCL", "Bihar", "MTR-BR-001", 5.0),   # POWER USER
    ("100100100102", "Rohit Kumar",       "SBPDCL", "Bihar", "MTR-BR-002", 7.0),   # POWER USER
    ("100100100103", "Priya Singh",       "SBPDCL", "Bihar", "MTR-BR-003", 7.0),   # POWER USER
    ("100100100104", "Amit Verma",        "SBPDCL", "Bihar", "MTR-BR-004", 2.0),   # DORMANT
    ("100100100105", "Neha Gupta",        "SBPDCL", "Bihar", "MTR-BR-005", 2.0),   # DORMANT
    ("100100100106", "Rajesh Yadav",      "SBPDCL", "Bihar", "MTR-BR-006", 2.0),   # DORMANT
    ("100100100107", "Sunita Devi",       "SBPDCL", "Bihar", "MTR-BR-007", 3.0),   # ZERO-CONSUMPTION
    ("100100100108", "Vikash Thakur",     "SBPDCL", "Bihar", "MTR-BR-008", 3.0),   # ZERO-CONSUMPTION
    ("100100100109", "Arun Prasad",       "SBPDCL", "Bihar", "MTR-BR-009", 3.0),   # ZERO-CONSUMPTION
    ("100100100110", "Kavita Kumari",     "SBPDCL", "Bihar", "MTR-BR-010", 5.0),   # SPIKE
    ("100100100111", "Manoj Mishra",      "SBPDCL", "Bihar", "MTR-BR-011", 5.0),   # SPIKE
    ("100100100112", "Deepa Rani",        "SBPDCL", "Bihar", "MTR-BR-012", 5.0),   # SPIKE
    ("100100100113", "Santosh Ranjan",    "SBPDCL", "Bihar", "MTR-BR-013", 5.0),
    ("100100100114", "Anjali Sinha",      "SBPDCL", "Bihar", "MTR-BR-014", 7.0),
    ("100100100115", "Pankaj Dubey",      "SBPDCL", "Bihar", "MTR-BR-015", 3.0),
    ("100100100116", "Renu Kumari",       "SBPDCL", "Bihar", "MTR-BR-016", 5.0),
    ("100100100117", "Sunil Pandey",      "SBPDCL", "Bihar", "MTR-BR-017", 5.0),
    ("100100100118", "Meena Sharma",      "SBPDCL", "Bihar", "MTR-BR-018", 2.0),
    ("100100100119", "Ashok Choudhary",   "SBPDCL", "Bihar", "MTR-BR-019", 7.0),
    ("100100100120", "Sarita Devi",       "SBPDCL", "Bihar", "MTR-BR-020", 3.0),
    ("100100100121", "Binod Kumar",       "SBPDCL", "Bihar", "MTR-BR-021", 5.0),
    ("100100100122", "Lakshmi Prasad",    "SBPDCL", "Bihar", "MTR-BR-022", 5.0),
    ("100100100123", "Ramesh Mandal",     "SBPDCL", "Bihar", "MTR-BR-023", 3.0),
    ("100100100124", "Pooja Bharti",      "SBPDCL", "Bihar", "MTR-BR-024", 7.0),
    ("100100100125", "Dinesh Sahni",      "SBPDCL", "Bihar", "MTR-BR-025", 5.0),
    # ═══ MGVCL — Gujarat ═══
    ("10010010201", "Raj Patel",          "MGVCL", "Gujarat", "MTR-GJ-001", 5.0),
    ("10010010202", "Meera Shah",         "MGVCL", "Gujarat", "MTR-GJ-002", 3.0),
    ("10010010203", "Vikram Joshi",       "MGVCL", "Gujarat", "MTR-GJ-003", 5.0),
    ("10010010204", "Anita Desai",        "MGVCL", "Gujarat", "MTR-GJ-004", 7.0),
    ("10010010205", "Kiran Modi",         "MGVCL", "Gujarat", "MTR-GJ-005", 5.0),
    ("10010010206", "Jayesh Bhatt",       "MGVCL", "Gujarat", "MTR-GJ-006", 3.0),
    ("10010010207", "Nisha Trivedi",      "MGVCL", "Gujarat", "MTR-GJ-007", 2.0),
    ("10010010208", "Suresh Parmar",      "MGVCL", "Gujarat", "MTR-GJ-008", 5.0),
    ("10010010209", "Hema Raval",         "MGVCL", "Gujarat", "MTR-GJ-009", 7.0),
    ("10010010210", "Prakash Chauhan",    "MGVCL", "Gujarat", "MTR-GJ-010", 3.0),
    ("10010010211", "Rina Dalal",         "MGVCL", "Gujarat", "MTR-GJ-011", 5.0),
    ("10010010212", "Nitin Solanki",      "MGVCL", "Gujarat", "MTR-GJ-012", 5.0),
    ("10010010213", "Priti Rana",         "MGVCL", "Gujarat", "MTR-GJ-013", 2.0),
    ("10010010214", "Dhiren Thakkar",     "MGVCL", "Gujarat", "MTR-GJ-014", 7.0),
    ("10010010215", "Sangita Dave",       "MGVCL", "Gujarat", "MTR-GJ-015", 3.0),
    ("10010010216", "Bhavin Mistry",      "MGVCL", "Gujarat", "MTR-GJ-016", 5.0),
    ("10010010217", "Komal Vyas",         "MGVCL", "Gujarat", "MTR-GJ-017", 5.0),
    ("10010010218", "Mahesh Gajjar",      "MGVCL", "Gujarat", "MTR-GJ-018", 7.0),
    ("10010010219", "Sonal Mehta",        "MGVCL", "Gujarat", "MTR-GJ-019", 2.0),
    ("10010010220", "Hitesh Barot",       "MGVCL", "Gujarat", "MTR-GJ-020", 3.0),
    ("10010010221", "Falguni Doshi",      "MGVCL", "Gujarat", "MTR-GJ-021", 5.0),
    ("10010010222", "Chirag Panchal",     "MGVCL", "Gujarat", "MTR-GJ-022", 7.0),
    ("10010010223", "Asmita Bhavsar",     "MGVCL", "Gujarat", "MTR-GJ-023", 3.0),   # OFFLINE
    ("10010010224", "Ketan Pandya",       "MGVCL", "Gujarat", "MTR-GJ-024", 5.0),   # OFFLINE
    ("10010010225", "Divya Nair",         "MGVCL", "Gujarat", "MTR-GJ-025", 5.0),   # OFFLINE
]

# Areas for varied geographic distribution
BIHAR_AREAS = ["Kankarbagh", "Boring Road", "Rajendra Nagar", "Patliputra", "Danapur",
               "Bailey Road", "Ashok Nagar", "Lohia Nagar", "Kadamkuan", "Nehru Nagar"]
GUJARAT_AREAS = ["Navrangpura", "Satellite", "Maninagar", "Vastrapur", "Bopal",
                 "SG Highway", "Gota", "Chandkheda", "Prahlad Nagar", "Bodakdev"]
BIHAR_FEEDERS = ["FDR-BR-001", "FDR-BR-002", "FDR-BR-003", "FDR-BR-004", "FDR-BR-005"]
GUJARAT_FEEDERS = ["FDR-GJ-001", "FDR-GJ-002", "FDR-GJ-003", "FDR-GJ-004", "FDR-GJ-005"]

# Appliance templates
APPLIANCE_TEMPLATES = [
    ("AC - Living Room",  "wind",        1500, "ac",              True,  "tier_3_comfort"),
    ("Geyser",            "thermometer", 2000, "geyser",          True,  "tier_1_shiftable"),
    ("Refrigerator",      "zap",          200, "refrigerator",    False, "tier_4_essential"),
    ("TV - Bedroom",      "tv",           120, "tv",              True,  "tier_4_essential"),
    ("Washing Machine",   "zap",          500, "washing_machine", True,  "tier_2_prep_needed"),
    ("Ceiling Fan",       "wind",          75, "fan",             True,  "tier_4_essential"),
    ("LED Lights",        "zap",           40, "lighting",        True,  "tier_4_essential"),
    ("Water Pump",        "zap",          750, "other",           True,  "tier_2_prep_needed"),
]

# Complaint templates
COMPLAINT_TEMPLATES = [
    ("outage",      "Power outage in my area",              "No electricity since {time}. Entire area affected."),
    ("outage",      "Frequent power cuts",                  "Multiple power cuts daily, lasting 2-3 hours each."),
    ("meter_error", "Meter showing wrong reading",          "Meter reading seems higher than actual usage."),
    ("meter_error", "Meter not updating",                   "Balance not deducting, meter display blank."),
    ("billing",     "Incorrect balance deduction",          "₹{amount} deducted but usage was minimal."),
    ("billing",     "Recharge not reflected",               "Recharged ₹{amount} but balance didn't update."),
    ("payment",     "Payment failed but amount debited",    "UPI payment of ₹{amount} debited but recharge not credited."),
    ("service",     "Need new connection",                  "Requesting new prepaid meter connection."),
    ("service",     "Voltage fluctuation",                  "Frequent voltage drops causing appliance damage."),
    ("other",       "Smart plug not working",               "Tuya smart plug disconnected and won't reconnect."),
    ("other",       "App not loading data",                 "Dashboard shows no readings since yesterday."),
]

COMPLAINT_STATUSES = ["received", "in_progress", "assigned", "resolved", "closed"]
ENGINEERS = ["Ravi Electricals", "Suresh Power Works", "Anil SBPDCL Team",
             "Pradeep MGVCL Ops", "Rakesh Field Service", None]


# ═══════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════

def now_ist() -> datetime:
    """Current datetime in IST."""
    return datetime.now(IST)

def fmt_ts(dt: datetime) -> str:
    """Format datetime as timezone-aware ISO 8601."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.isoformat()

def fmt_date(d) -> str:
    """Format date as YYYY-MM-DD."""
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    return d.strftime("%Y-%m-%d")

def random_phone() -> str:
    """Generate proper Indian 10-digit mobile number."""
    first_digit = random.choice([6, 7, 8, 9])
    remaining = random.randint(100000000, 999999999)
    return f"+91{first_digit}{remaining}"

def random_recharge_amount() -> float:
    """Realistic recharge amount distribution.
    Modal around ₹500, skewed toward smaller amounts.
    Common values: ₹200, ₹300, ₹500, ₹700, ₹1000."""
    # Weighted choices matching real Indian prepaid patterns
    amounts = [200, 200, 300, 300, 300, 500, 500, 500, 500, 500,
               700, 700, 1000, 1000, 1200]
    return float(random.choice(amounts))

def realistic_power_kw(hour: int, meter_type: str = "normal") -> float:
    """Generate realistic residential power (kW) for a given hour.
    meter_type: 'normal', 'zero', 'spike', 'power_user', 'dormant'"""

    if meter_type == "zero":
        return round(random.uniform(0.0, 0.02), 4)  # Near-zero

    # Indian residential load curve
    if 0 <= hour < 5:
        base = random.uniform(0.2, 0.5)
    elif 5 <= hour < 6:
        base = random.uniform(0.4, 0.8)
    elif 6 <= hour < 9:
        base = random.uniform(0.8, 1.5)
    elif 9 <= hour < 10:
        base = random.uniform(0.5, 1.0)
    elif 10 <= hour < 16:
        base = random.uniform(0.3, 0.9)
    elif 16 <= hour < 18:
        base = random.uniform(0.6, 1.2)
    elif 18 <= hour < 22:
        base = random.uniform(1.5, 3.5)
    elif 22 <= hour < 23:
        base = random.uniform(0.8, 1.5)
    else:
        base = random.uniform(0.4, 0.8)

    # Apply multipliers
    if meter_type == "spike":
        base *= random.uniform(2.5, 4.0)  # 2.5-4× spike
    elif meter_type == "power_user":
        base *= random.uniform(1.5, 2.2)  # 1.5-2.2× normal
    elif meter_type == "dormant":
        base *= random.uniform(0.3, 0.5)  # Very low usage

    return round(base * random.uniform(0.85, 1.15), 3)

def get_meter_type(idx: int) -> str:
    """Determine meter behavior type based on consumer index."""
    if 0 <= idx <= 2:
        return "power_user"
    elif 3 <= idx <= 5:
        return "dormant"
    elif 6 <= idx <= 8:
        return "zero"
    elif 9 <= idx <= 11:
        return "spike"
    elif 47 <= idx <= 49:
        return "offline"
    return "normal"

def is_spike_window(d: date) -> bool:
    """Check if date is within the last 7 days (spike window)."""
    return (date.today() - d).days <= 7


# ═══════════════════════════════════════════════════════════════════
# FETCH EXISTING USERS (ONCE)
# ═══════════════════════════════════════════════════════════════════

def fetch_all_auth_users() -> dict:
    """Fetch ALL auth users once and return email→id map.
    Handles pagination for the admin list_users API."""
    email_to_id = {}
    page = 1
    per_page = 500

    print("  Fetching existing auth users...")
    while True:
        try:
            response = supabase.auth.admin.list_users(page=page, per_page=per_page)

            # Handle different SDK return shapes
            users = []
            if hasattr(response, '__iter__'):
                users = list(response)
            elif hasattr(response, 'users'):
                users = response.users
            elif isinstance(response, dict):
                users = response.get('users', response.get('data', []))

            if not users:
                break

            for u in users:
                if hasattr(u, 'email') and hasattr(u, 'id'):
                    email_to_id[u.email] = u.id
                elif isinstance(u, dict):
                    email_to_id[u.get('email', '')] = u.get('id', '')

            if len(users) < per_page:
                break

            page += 1
        except Exception as e:
            print(f"    Warning: list_users page {page} failed: {e}")
            break

    print(f"    Found {len(email_to_id)} existing auth users")
    return email_to_id


# ═══════════════════════════════════════════════════════════════════
# MAIN SEED FUNCTIONS
# ═══════════════════════════════════════════════════════════════════

def check_existing_seed() -> tuple:
    """Check if seed data already exists. Returns (has_profiles, has_homes)."""
    try:
        profiles = supabase.table("profiles").select("id").eq("location", "SEED_DATA").limit(1).execute()
        has_profiles = len(profiles.data if hasattr(profiles, 'data') else []) > 0
        homes = supabase.table("homes").select("id", count="exact").limit(0).execute()
        home_count = homes.count if hasattr(homes, 'count') and homes.count else 0
        return has_profiles, home_count
    except Exception:
        return False, 0


def lookup_tariff_plan_ids():
    """Dynamically look up tariff plan IDs from the database.
    This avoids hardcoding UUIDs that may differ between environments."""
    global SBPDCL_PLAN_ID, MGVCL_PLAN_ID

    print("  Looking up tariff plan IDs from database...")
    try:
        plans = supabase.table("tariff_plans").select("id, discom_id").eq("is_active", True).execute()
        for plan in (plans.data or []):
            if plan["discom_id"] == SBPDCL_DISCOM_ID:
                SBPDCL_PLAN_ID = plan["id"]
                print(f"    SBPDCL plan: {SBPDCL_PLAN_ID}")
            elif plan["discom_id"] == MGVCL_DISCOM_ID:
                MGVCL_PLAN_ID = plan["id"]
                print(f"    MGVCL plan:  {MGVCL_PLAN_ID}")
    except Exception as e:
        print(f"  ✗ Failed to look up tariff plans: {e}")

    if not SBPDCL_PLAN_ID or not MGVCL_PLAN_ID:
        print("  ✗ ERROR: Could not find active tariff plans for SBPDCL/MGVCL.")
        print("    Make sure 04_seed_tariffs.sql has been run.")
        sys.exit(1)


def get_taken_consumer_numbers() -> set:
    """Get consumer numbers already linked to real (non-seed) profiles.
    These must NOT be assigned to seed profiles to avoid unique constraint violations."""
    try:
        result = supabase.table("profiles").select("consumer_number").neq("location", "SEED_DATA").not_.is_("consumer_number", "null").execute()
        taken = {row["consumer_number"] for row in (result.data or [])}
        if taken:
            print(f"    Found {len(taken)} consumer numbers already linked to real users")
        return taken
    except Exception as e:
        print(f"    Warning: Could not check existing consumer numbers: {e}")
        return set()


def create_auth_users(existing_users: dict) -> list:
    """Create 50 auth users via Supabase Admin API.
    Uses pre-fetched existing_users map to avoid re-listing.
    Returns list of (user_id, index)."""
    print("\n═══ Creating 50 auth users ═══")
    user_ids = []

    for i, consumer in enumerate(CONSUMERS):
        consumer_number, name, discom, state, meter_number, load_kw = consumer
        email = f"seed_consumer_{i+1:02d}@voltwise.local"

        # Check pre-fetched map first
        if email in existing_users:
            uid = existing_users[email]
            print(f"  ✓ [{i+1:2d}/50] {name:<20s} — exists ({uid[:8]}…)")
            user_ids.append((uid, i))
            continue

        # Create new auth user
        try:
            result = supabase.auth.admin.create_user({
                "email": email,
                "password": SEED_PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "name": name,
                    "phone": random_phone(),
                    "consumer_number": consumer_number,
                }
            })

            # Defensive access — SDK may return different shapes
            user_id = None
            if hasattr(result, 'user') and result.user:
                user_id = result.user.id if hasattr(result.user, 'id') else None
            elif hasattr(result, 'id'):
                user_id = result.id
            elif isinstance(result, dict):
                user_obj = result.get('user', result.get('data', result))
                user_id = user_obj.get('id') if isinstance(user_obj, dict) else None

            if not user_id:
                print(f"  ✗ [{i+1:2d}/50] {name:<20s} — unexpected return: {type(result)}")
                continue

            print(f"  ✓ [{i+1:2d}/50] {name:<20s} — created ({user_id[:8]}…)")
            user_ids.append((user_id, i))

        except Exception as e:
            err_str = str(e).lower()
            if "already" in err_str or "registered" in err_str or "exists" in err_str:
                # User was created between our fetch and now — re-check
                try:
                    refreshed = supabase.auth.admin.list_users(page=1, per_page=1000)
                    users_list = list(refreshed) if hasattr(refreshed, '__iter__') else []
                    uid = None
                    for u in users_list:
                        u_email = u.email if hasattr(u, 'email') else u.get('email', '')
                        if u_email == email:
                            uid = u.id if hasattr(u, 'id') else u.get('id')
                            break
                    if uid:
                        print(f"  ✓ [{i+1:2d}/50] {name:<20s} — found ({uid[:8]}…)")
                        user_ids.append((uid, i))
                        continue
                except Exception:
                    pass
                print(f"  ✗ [{i+1:2d}/50] {name:<20s} — already exists but ID not found")
            else:
                print(f"  ✗ [{i+1:2d}/50] {name:<20s} — error: {e}")

    print(f"\n  Total auth users ready: {len(user_ids)}")
    return user_ids


def seed_profiles(user_ids: list, taken_consumer_numbers: set) -> int:
    """Upsert profiles (guarantees row exists even without auth trigger).
    Skips consumer_number if already taken by a real user."""
    print("\n═══ Upserting profiles ═══")
    count = 0
    skipped_cn = 0

    for user_id, i in user_ids:
        consumer = CONSUMERS[i]
        consumer_number, name, discom, state, meter_number, load_kw = consumer

        profile_data = {
            "id": user_id,
            "name": name,
            "phone": random_phone(),
            "location": "SEED_DATA",
            "household_members": random.choice([2, 3, 4, 5, 6]),
            "onboarding_done": True,
            "role": "consumer",
        }

        # Only set consumer_number if not already taken by a real user
        if consumer_number not in taken_consumer_numbers:
            profile_data["consumer_number"] = consumer_number
        else:
            skipped_cn += 1

        try:
            supabase.table("profiles").upsert(
                profile_data, on_conflict="id"
            ).execute()
            count += 1
        except Exception as e:
            # If it still fails on consumer_number, retry without it
            if "consumer_number" in str(e):
                try:
                    profile_data.pop("consumer_number", None)
                    supabase.table("profiles").upsert(
                        profile_data, on_conflict="id"
                    ).execute()
                    count += 1
                    skipped_cn += 1
                except Exception as e2:
                    print(f"  ✗ Profile upsert failed for {name}: {e2}")
            else:
                print(f"  ✗ Profile upsert failed for {name}: {e}")

    if skipped_cn:
        print(f"  ⚠ Skipped consumer_number for {skipped_cn} profiles (already taken by real users)")
    print(f"  Upserted {count} profiles")
    return count


def seed_homes(user_ids: list) -> list:
    """Create homes for each user. Returns list of (home_id, user_id, index)."""
    print("\n═══ Creating 50 homes ═══")
    homes = []

    for user_id, i in user_ids:
        consumer = CONSUMERS[i]
        consumer_number, name, discom, state, meter_number, load_kw = consumer

        is_bihar = discom == "SBPDCL"
        area = random.choice(BIHAR_AREAS if is_bihar else GUJARAT_AREAS)
        feeder = random.choice(BIHAR_FEEDERS if is_bihar else GUJARAT_FEEDERS)
        city = "Patna" if is_bihar else "Ahmedabad"
        plan_id = SBPDCL_PLAN_ID if is_bihar else MGVCL_PLAN_ID

        home_data = {
            "user_id": user_id,
            "name": f"{name}'s Home",
            "address": f"{random.randint(1, 500)}, {area}",
            "city": city,
            "state": state,
            "pincode": str(random.randint(800001, 800025)) if is_bihar else str(random.randint(380001, 380025)),
            "area": area,
            "feeder_id": feeder,
            "tariff_category": "residential",
            "tariff_plan_id": plan_id,
            "sanctioned_load_kw": load_kw,
            "is_primary": True,
            "autopilot_enabled": random.choice([True, False]),
            "autopilot_strategy": random.choice(["balanced", "max_savings", "comfort_first"]),
            "grid_protection_enabled": random.choice([True, False]),
        }

        try:
            result = supabase.table("homes").insert(home_data).execute()
            home_id = result.data[0]["id"]
            homes.append((home_id, user_id, i))
        except Exception as e:
            err_str = str(e).lower()
            if "duplicate" in err_str or "unique" in err_str:
                # Home already exists for this user — find it
                try:
                    existing = supabase.table("homes").select("id").eq("user_id", user_id).eq("is_primary", True).limit(1).execute()
                    if existing.data:
                        homes.append((existing.data[0]["id"], user_id, i))
                        continue
                except Exception:
                    pass
            print(f"  ✗ Home for {name}: {e}")

    print(f"  Created {len(homes)} homes")
    return homes


def seed_meters(homes: list) -> list:
    """Create meters for each home with edge-case distribution.
    Returns list of (meter_id, home_id, user_id, index)."""
    print("\n═══ Creating 50 meters ═══")
    meters = []
    now = now_ist()

    for home_id, user_id, i in homes:
        consumer = CONSUMERS[i]
        consumer_number, name, discom, state, meter_number, load_kw = consumer
        mtype = get_meter_type(i)

        # ── Last reading time based on meter type ──
        if mtype == "offline":
            last_reading = now - timedelta(days=random.randint(30, 60))
        elif mtype == "zero":
            last_reading = now - timedelta(hours=random.randint(2, 8))
        elif mtype == "dormant":
            last_reading = now - timedelta(hours=random.randint(8, 20))
        elif i >= 40 and i < 47:
            # Stale meters (6-24h)
            last_reading = now - timedelta(hours=random.randint(6, 23))
        else:
            # Online (<1h)
            last_reading = now - timedelta(minutes=random.randint(5, 55))

        # ── Balance based on type ──
        if mtype == "power_user":
            balance = round(random.uniform(800, 1500), 2)
        elif mtype == "dormant":
            balance = round(random.uniform(500, 900), 2)
        elif mtype == "offline":
            balance = round(random.uniform(5, 30), 2)     # Critical — offline
        elif mtype == "zero":
            balance = round(random.uniform(300, 700), 2)   # Has balance but no usage
        elif i < 5:
            balance = round(random.uniform(10, 45), 2)     # Critical
        elif i < 12:
            balance = round(random.uniform(50, 195), 2)    # Low
        else:
            balance = round(random.uniform(200, 1200), 2)  # Normal

        last_recharge_days_ago = random.randint(2, 40)
        last_recharge_amount = random_recharge_amount()

        meter_data = {
            "home_id": home_id,
            "meter_number": meter_number,
            "meter_type": "prepaid",
            "manufacturer": random.choice(["Genus", "HPL", "Secure", "L&T", "Havells"]),
            "installation_date": fmt_date(date.today() - timedelta(days=random.randint(90, 365))),
            "is_active": True,
            "last_reading_at": fmt_ts(last_reading),
            "balance_amount": balance,
            "last_recharge_amount": last_recharge_amount,
            "last_recharge_date": fmt_ts(now - timedelta(days=last_recharge_days_ago)),
        }

        try:
            result = supabase.table("meters").insert(meter_data).execute()
            meter_id = result.data[0]["id"]
            meters.append((meter_id, home_id, user_id, i))
        except Exception as e:
            print(f"  ✗ Meter {meter_number}: {e}")

    print(f"  Created {len(meters)} meters")
    return meters


def seed_recharges(meters: list) -> int:
    """Seed 6 months of recharges with realistic distribution.
    Power users get more recharges. Dormant users get fewer.
    balance_after is computed by tracking running balance."""
    print("\n═══ Seeding recharges (6 months) ═══")
    recharges = []
    now = now_ist()
    methods = ["upi", "upi", "upi", "debit_card", "net_banking", "wallet"]  # UPI 50%

    for meter_id, home_id, user_id, i in meters:
        mtype = get_meter_type(i)
        is_bihar = CONSUMERS[i][2] == "SBPDCL"
        rate = 7.42 if is_bihar else 3.20

        # Running balance for realistic balance_after
        running_balance = 0.0

        for month_offset in range(6):
            month_start = now - timedelta(days=30 * (month_offset + 1))

            # Recharges per month based on user type
            if mtype == "power_user":
                num_recharges = random.randint(3, 5)
            elif mtype == "dormant":
                num_recharges = random.choice([0, 0, 1])  # Rarely recharge
            elif mtype == "offline":
                num_recharges = random.choice([0, 1])
            else:
                num_recharges = random.randint(1, 3)

            for r in range(num_recharges):
                amount = random_recharge_amount()
                if mtype == "power_user":
                    amount = float(random.choice([700, 1000, 1000, 1200, 1200]))

                paid_at = month_start + timedelta(
                    days=random.randint(0, 28),
                    hours=random.randint(8, 22),
                    minutes=random.randint(0, 59)
                )
                units = round(amount / rate, 2)
                running_balance += amount
                # Simulate usage deduction
                running_balance -= random.uniform(200, 500)
                running_balance = max(running_balance, 10)

                recharges.append({
                    "user_id": user_id,
                    "meter_id": meter_id,
                    "amount": amount,
                    "method": random.choice(methods),
                    "status": "success",
                    "transaction_id": f"SEED-{uuid4().hex[:12].upper()}",
                    "units_credited": units,
                    "balance_after": round(running_balance, 2),
                    "paid_at": fmt_ts(paid_at),
                    "source": "seed",
                })

    # Batch insert in chunks of 100
    total = 0
    for chunk_start in range(0, len(recharges), 100):
        chunk = recharges[chunk_start:chunk_start + 100]
        try:
            supabase.table("recharges").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ Recharge batch at {chunk_start}: {e}")

    print(f"  Created {total} recharges")
    return total


def seed_complaints(user_ids: list, homes: list) -> int:
    """Seed 200+ complaints with varied statuses."""
    print("\n═══ Seeding complaints ═══")
    complaints = []
    now = now_ist()

    home_map = {uid: hid for hid, uid, _ in homes}
    meter_results = supabase.table("meters").select("id, home_id").execute()
    meter_map = {m["home_id"]: m["id"] for m in (meter_results.data or [])}

    for user_id, i in user_ids:
        num_complaints = random.randint(3, 6)

        for _ in range(num_complaints):
            template = random.choice(COMPLAINT_TEMPLATES)
            ctype, subject, desc = template

            desc = desc.replace("{time}", f"{random.randint(1,12)} hours ago")
            desc = desc.replace("{amount}", str(random.randint(100, 800)))

            status = random.choice(COMPLAINT_STATUSES)
            priority = random.randint(1, 5)
            created_at = now - timedelta(days=random.randint(1, 180))
            assigned_to = random.choice(ENGINEERS) if status in ("assigned", "resolved", "closed") else None

            resolved_at = None
            resolution_note = None
            if status in ("resolved", "closed"):
                resolve_hours = random.randint(2, 96)
                resolved_at = fmt_ts(created_at + timedelta(hours=resolve_hours))
                resolution_note = random.choice([
                    "Issue resolved. Meter recalibrated.",
                    "Power restored. Transformer repaired.",
                    "Balance credited. Transaction verified.",
                    "Field visit completed. Wiring fixed.",
                    "Recharge processed manually.",
                    "Smart plug replaced.",
                ])

            home_id = home_map.get(user_id)
            meter_id = meter_map.get(home_id)

            complaints.append({
                "user_id": user_id,
                "home_id": home_id,
                "meter_id": meter_id,
                "type": ctype,
                "subject": subject,
                "description": desc,
                "status": status,
                "priority": priority,
                "assigned_to": assigned_to,
                "resolved_at": resolved_at,
                "resolution_note": resolution_note,
                "created_at": fmt_ts(created_at),
                "source": "seed",
            })

    # Batch insert
    total = 0
    for chunk_start in range(0, len(complaints), 50):
        chunk = complaints[chunk_start:chunk_start + 50]
        try:
            supabase.table("complaints").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ Complaint batch at {chunk_start}: {e}")

    print(f"  Created {total} complaints")
    return total


def seed_appliances(homes: list) -> int:
    """Seed 5-8 appliances per home with consistent power values."""
    print("\n═══ Seeding appliances ═══")
    appliances = []
    statuses = ["ON", "OFF", "SCHEDULED", "OFF"]

    for home_id, user_id, i in homes:
        num_appliances = random.randint(5, 8)
        selected = random.sample(APPLIANCE_TEMPLATES, min(num_appliances, len(APPLIANCE_TEMPLATES)))

        for sort_idx, (name, icon, power_w, category, controllable, tier) in enumerate(selected):
            status = random.choice(statuses)

            # Consistent current_power_w when ON
            if status == "ON":
                # Use ~80-100% of rated power (realistic operating range)
                current_power_w = round(power_w * random.uniform(0.80, 1.0), 2)
            else:
                current_power_w = 0

            appliances.append({
                "home_id": home_id,
                "name": name,
                "icon": icon,
                "rated_power_w": power_w,
                "current_power_w": current_power_w,
                "status": status,
                "category": category,
                "is_controllable": controllable,
                "optimization_tier": tier,
                "is_active": True,
                "sort_order": sort_idx,
                "eco_mode_enabled": random.choice([True, False]),
                "source": "manual",
                "saving_potential": round(random.uniform(5, 30), 1) if controllable else 0,
            })

    # Batch insert
    total = 0
    for chunk_start in range(0, len(appliances), 50):
        chunk = appliances[chunk_start:chunk_start + 50]
        try:
            supabase.table("appliances").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ Appliance batch at {chunk_start}: {e}")

    print(f"  Created {total} appliances")
    return total


def seed_daily_aggregates(homes: list, meters: list) -> int:
    """Seed 6 months of daily aggregates with edge-case patterns.
    Uses upsert to handle duplicate (home_id, date) gracefully."""
    print("\n═══ Seeding daily aggregates (6 months) ═══")
    meter_map = {h: m for m, h, _, _ in meters}
    type_map = {h: get_meter_type(i) for _, h, _, i in meters}
    today = date.today()
    aggregates = []

    for home_id, user_id, i in homes:
        meter_id = meter_map.get(home_id)
        if not meter_id:
            continue

        is_bihar = CONSUMERS[i][2] == "SBPDCL"
        base_rate = 7.42 if is_bihar else 3.20
        mtype = get_meter_type(i)

        for day_offset in range(180):
            d = today - timedelta(days=day_offset)
            is_weekend = d.weekday() in (5, 6)
            in_spike_window = is_spike_window(d) and mtype == "spike"

            # ── Seasonal factor ──
            month = d.month
            if month in (4, 5, 6):
                seasonal_factor = 1.3
            elif month in (11, 12, 1, 2):
                seasonal_factor = 1.15
            else:
                seasonal_factor = 1.0

            # ── Base kWh by type ──
            if mtype == "zero":
                total_kwh = round(random.uniform(0.0, 0.3), 2)
            elif mtype == "dormant":
                total_kwh = round(random.uniform(2, 5) * seasonal_factor, 2)
            elif mtype == "power_user":
                base = 20 if is_weekend else 16
                total_kwh = round((base + random.uniform(-2, 3)) * seasonal_factor, 2)
            elif in_spike_window:
                base = 14 if is_weekend else 11
                total_kwh = round((base * random.uniform(2.5, 4.0)) * seasonal_factor, 2)
            else:
                base = 14 if is_weekend else 11
                total_kwh = round((base + random.uniform(-2, 2)) * seasonal_factor, 2)

            total_cost = round(total_kwh * base_rate, 2)

            aggregates.append({
                "home_id": home_id,
                "meter_id": meter_id,
                "date": fmt_date(d),
                "total_kwh": total_kwh,
                "total_cost": total_cost,
                "peak_power_kw": round(random.uniform(2.0, 5.0), 2) if mtype != "zero" else 0.02,
                "avg_power_kw": round(total_kwh / 24, 2),
                "on_hours": round(random.uniform(10, 18), 1) if mtype != "zero" else 0,
                "carbon_kg": round(total_kwh * 0.82, 3),
                "source": "seed",
            })

    # Batch insert — skip duplicates silently
    total = 0
    for chunk_start in range(0, len(aggregates), 500):
        chunk = aggregates[chunk_start:chunk_start + 500]
        try:
            supabase.table("daily_aggregates").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            err = str(e).lower()
            if "duplicate" in err or "unique" in err or "conflict" in err:
                # Insert one by one for duplicate-heavy chunks
                for row in chunk:
                    try:
                        supabase.table("daily_aggregates").insert(row).execute()
                        total += 1
                    except Exception:
                        pass  # Skip duplicates
            else:
                print(f"  ✗ Daily agg batch at {chunk_start}: {e}")

    print(f"  Created {total} daily aggregate rows")
    return total


def seed_meter_readings(meters: list) -> int:
    """Seed 30 days of 15-min meter readings with edge-case patterns.
    ~144,000 rows total (50 meters × 96 readings/day × 30 days).
    Offline meters get NO readings (tests meter health dashboard)."""
    print("\n═══ Seeding meter readings (30 days × 96/day × up to 50 meters) ═══")
    print("  This will take 2-5 minutes...")

    today = date.today()
    total = 0

    for meter_idx, (meter_id, home_id, user_id, i) in enumerate(meters):
        mtype = get_meter_type(i)

        # ── Offline meters: NO readings at all ──
        if mtype == "offline":
            print(f"  ⚡ [{meter_idx+1:2d}/50] {CONSUMERS[i][1]:<20s} — OFFLINE (0 readings)")
            continue

        is_bihar = CONSUMERS[i][2] == "SBPDCL"
        base_voltage = 230 if is_bihar else 240
        base_rate = 7.42 if is_bihar else 3.20
        cumulative_kwh = round(random.uniform(5000, 15000), 4)

        readings_batch = []
        days_to_seed = 30

        for day_offset in range(days_to_seed):
            d = today - timedelta(days=day_offset)
            in_spike = is_spike_window(d) and mtype == "spike"

            for interval in range(96):
                hour = interval // 4
                minute = (interval % 4) * 15
                ts = datetime(d.year, d.month, d.day, hour, minute, 0, tzinfo=IST)

                effective_type = mtype
                if in_spike:
                    effective_type = "spike"

                power_kw = realistic_power_kw(hour, effective_type)
                kwh_delta = round(power_kw * 0.25, 4)
                cumulative_kwh += kwh_delta
                voltage = round(base_voltage + random.uniform(-8, 8), 2)
                current_a = round(power_kw * 1000 / voltage, 2) if voltage > 0 else 0
                cost_delta = round(kwh_delta * base_rate, 2)

                readings_batch.append({
                    "meter_id": meter_id,
                    "timestamp": fmt_ts(ts),
                    "kwh_reading": round(cumulative_kwh, 4),
                    "kwh_delta": kwh_delta,
                    "power_kw": power_kw,
                    "voltage": voltage,
                    "current_amps": current_a,
                    "power_factor": round(random.uniform(0.85, 0.99), 3),
                    "cost_delta": cost_delta,
                    "tariff_rate": base_rate,
                    "source": "seed",
                })

                if len(readings_batch) >= 2000:
                    try:
                        supabase.table("meter_readings").insert(readings_batch).execute()
                        total += len(readings_batch)
                    except Exception as e:
                        print(f"  ✗ Readings batch for meter {meter_idx}: {e}")
                    readings_batch = []

        if readings_batch:
            try:
                supabase.table("meter_readings").insert(readings_batch).execute()
                total += len(readings_batch)
            except Exception as e:
                print(f"  ✗ Final readings batch for meter {meter_idx}: {e}")

        label = f"({mtype})" if mtype != "normal" else ""
        if (meter_idx + 1) % 10 == 0 or mtype != "normal":
            print(f"  ⚡ [{meter_idx+1:2d}/50] {CONSUMERS[i][1]:<20s} {label:15s} ({total:>7,} total)")

    print(f"  Created {total:,} meter readings")
    return total


def seed_carbon_stats(homes: list) -> int:
    """Seed 6 months of carbon stats per home."""
    print("\n═══ Seeding carbon stats ═══")
    today = date.today()
    stats = []

    for home_id, user_id, i in homes:
        for month_offset in range(6):
            month_date = (today.replace(day=1) - timedelta(days=30 * month_offset)).replace(day=1)

            improvement = 1 - (month_offset * 0.05)
            user_co2 = round(random.uniform(250, 350) * improvement, 2)
            neighbor = round(random.uniform(260, 320), 2)
            national = 280.0
            saved = round(random.uniform(3, 15) * (6 - month_offset) / 6, 2)

            stats.append({
                "home_id": home_id,
                "month": fmt_date(month_date),
                "user_kg_co2": user_co2,
                "neighbor_avg": neighbor,
                "national_avg": national,
                "co2_saved_kg": saved,
                "trees_equivalent": round(saved / 1.75, 1),
                "source": "seed",
            })

    total = 0
    for chunk_start in range(0, len(stats), 100):
        chunk = stats[chunk_start:chunk_start + 100]
        try:
            supabase.table("carbon_stats").upsert(chunk, on_conflict="home_id,month").execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ Carbon stats batch: {e}")

    print(f"  Created {total} carbon stat rows")
    return total


def seed_bills(homes: list, meters: list) -> int:
    """Seed 6 months of bills with savings_amount."""
    print("\n═══ Seeding bills (optimization savings) ═══")
    meter_map = {h: m for m, h, _, _ in meters}
    today = date.today()
    bills = []

    for home_id, user_id, i in homes:
        meter_id = meter_map.get(home_id)
        is_bihar = CONSUMERS[i][2] == "SBPDCL"
        base_rate = 7.42 if is_bihar else 3.20

        for month_offset in range(6):
            month_date = (today.replace(day=1) - timedelta(days=30 * month_offset)).replace(day=1)
            total_kwh = round(random.uniform(250, 400), 2)
            base_amount = round(total_kwh * base_rate, 2)
            savings = round(random.uniform(30, 120) * (6 - month_offset) / 6, 2)

            bills.append({
                "home_id": home_id,
                "meter_id": meter_id,
                "bill_month": fmt_date(month_date),
                "total_kwh": total_kwh,
                "base_amount": base_amount,
                "tax_amount": round(base_amount * 0.05, 2),
                "surcharge_amount": round(base_amount * 0.02, 2),
                "total_amount": round(base_amount * 1.07, 2),
                "savings_amount": savings,
                "status": "generated",
                "source": "seed",
            })

    total = 0
    for chunk_start in range(0, len(bills), 100):
        chunk = bills[chunk_start:chunk_start + 100]
        try:
            supabase.table("bills").insert(chunk).execute()
            total += len(chunk)
        except Exception as e:
            print(f"  ✗ Bills batch: {e}")

    print(f"  Created {total} bills")
    return total


def seed_schedules_and_recommendations(homes: list) -> tuple:
    """Seed schedules and recommendations for optimization impact."""
    print("\n═══ Seeding schedules & recommendations ═══")
    schedule_count = 0
    rec_count = 0

    for home_id, user_id, i in homes:
        try:
            apps = supabase.table("appliances").select("id, name, category").eq("home_id", home_id).eq("is_active", True).execute()
        except Exception:
            continue

        for app in (apps.data or []):
            if app["category"] in ("ac", "geyser", "washing_machine"):
                if random.random() < 0.6:
                    try:
                        supabase.table("schedules").insert({
                            "appliance_id": app["id"],
                            "home_id": home_id,
                            "start_time": random.choice(["06:00", "10:00", "22:00", "05:30"]),
                            "end_time": random.choice(["07:30", "12:00", "23:30", "06:30"]),
                            "repeat_type": random.choice(["daily", "weekdays", "weekends"]),
                            "is_active": random.choice([True, True, False]),
                            "created_by": random.choice(["user", "autopilot", "optimizer"]),
                        }).execute()
                        schedule_count += 1
                    except Exception:
                        pass

                if random.random() < 0.7:
                    try:
                        supabase.table("recommendations").insert({
                            "home_id": home_id,
                            "appliance_id": app["id"],
                            "type": random.choice(["schedule_shift", "usage_reduction"]),
                            "title": f"Shift {app['name']} to off-peak",
                            "description": f"Move {app['name']} usage to 10 PM - 6 AM for ₹{random.randint(20,80)}/month savings",
                            "savings_per_use": round(random.uniform(1, 5), 2),
                            "savings_per_month": round(random.uniform(20, 80), 2),
                            "suggested_time": random.choice(["22:00", "05:00", "10:00"]),
                            "is_acted_on": random.choice([True, True, False]),
                            "is_dismissed": False,
                        }).execute()
                        rec_count += 1
                    except Exception:
                        pass

    print(f"  Created {schedule_count} schedules, {rec_count} recommendations")
    return schedule_count, rec_count


def print_summary():
    """Print final verification summary."""
    print("\n" + "═" * 65)
    print("  SEED DATA VERIFICATION SUMMARY")
    print("═" * 65)

    tables = [
        ("profiles WHERE location='SEED_DATA'",    "profiles",          {"location": "SEED_DATA"}),
        ("homes (total)",                           "homes",             None),
        ("meters (total)",                          "meters",            None),
        ("recharges WHERE source='seed'",           "recharges",         {"source": "seed"}),
        ("complaints WHERE source='seed'",          "complaints",        {"source": "seed"}),
        ("appliances (total)",                      "appliances",        None),
        ("daily_aggregates WHERE source='seed'",    "daily_aggregates",  {"source": "seed"}),
        ("meter_readings WHERE source='seed'",      "meter_readings",    {"source": "seed"}),
        ("carbon_stats WHERE source='seed'",        "carbon_stats",      {"source": "seed"}),
        ("bills WHERE source='seed'",               "bills",             {"source": "seed"}),
        ("schedules (total)",                       "schedules",         None),
        ("recommendations (total)",                 "recommendations",   None),
    ]

    for label, table, filters in tables:
        try:
            q = supabase.table(table).select("id", count="exact")
            if filters:
                for k, v in filters.items():
                    q = q.eq(k, v)
            result = q.limit(0).execute()
            count = result.count if hasattr(result, 'count') and result.count is not None else "?"
            print(f"  {label:45s} → {count:>7} rows")
        except Exception as e:
            print(f"  {label:45s} → ERROR: {e}")

    print("═" * 65)

    print("\n  Edge-case meters:")
    print("    • Consumers 1-3:    Power users   (high recharges + usage)")
    print("    • Consumers 4-6:    Dormant users (few recharges, low usage)")
    print("    • Consumers 7-9:    Zero-consump. (readings ≈ 0 kWh)")
    print("    • Consumers 10-12:  Spike meters  (2-4× load last 7 days)")
    print("    • Consumers 48-50:  Offline       (no readings, 30+ days)")


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  VoltWise — Admin Seed Data Generator v2                     ║")
    print("║  Seeds 50 consumers with complete admin analytics data       ║")
    print("║  Includes: power users, dormant, zero-consumption, spikes   ║")
    print("╚═══════════════════════════════════════════════════════════════╝")

    # Step 0a: Look up tariff plan IDs from database (no more hardcoded UUIDs)
    lookup_tariff_plan_ids()

    # Step 0b: Check which consumer numbers are already taken by real users
    taken_consumer_numbers = get_taken_consumer_numbers()

    # Check prerequisites
    has_profiles, home_count = check_existing_seed()
    if has_profiles:
        if home_count >= 50:
            print("\n⚠️  Full seed data already exists (profiles + homes).")
            answer = input("   Re-run anyway? (y/N): ").strip().lower()
            if answer != "y":
                print("   Aborted.")
                return
        else:
            print(f"\n⚠️  Partial seed data found ({home_count} homes). Continuing to fill gaps...")

    # Step 0c: Fetch all existing auth users ONCE
    existing_users = fetch_all_auth_users()

    # Step 1: Create auth users (skips existing)
    user_ids = create_auth_users(existing_users)
    if not user_ids:
        print("\nERROR: No users created. Check Supabase connection.")
        return

    # Step 2: Upsert profiles (guaranteed to exist, skips taken consumer_numbers)
    seed_profiles(user_ids, taken_consumer_numbers)

    # Step 3: Create homes
    homes = seed_homes(user_ids)
    if not homes:
        print("\nERROR: No homes created.")
        return

    # Step 4: Create meters (with edge-case distribution)
    meters = seed_meters(homes)
    if not meters:
        print("\nERROR: No meters created.")
        return

    # Step 5: Seed recharges (6 months, 300+)
    seed_recharges(meters)

    # Step 6: Seed complaints (200+)
    seed_complaints(user_ids, homes)

    # Step 7: Seed appliances (300+)
    seed_appliances(homes)

    # Step 8: Seed daily aggregates (6 months, ~9,000 rows)
    seed_daily_aggregates(homes, meters)

    # Step 9: Seed meter readings (30 days, ~135,000 rows — offline meters excluded)
    seed_meter_readings(meters)

    # Step 10: Seed carbon stats
    seed_carbon_stats(homes)

    # Step 11: Seed bills with savings
    seed_bills(homes, meters)

    # Step 12: Seed schedules & recommendations
    seed_schedules_and_recommendations(homes)

    # Summary
    print_summary()

    print("\n✅ Seed complete!")
    print("   Next steps:")
    print("   1. Run 18_admin_rpc_functions.sql in Supabase SQL Editor")
    print("   2. Verify with: SELECT get_admin_dashboard_stats();")
    print("   3. To clean up: run 19_cleanup_seed_data.sql")


if __name__ == "__main__":
    main()
