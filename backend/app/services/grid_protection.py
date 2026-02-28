"""
Grid Protection Service — Mock implementation + future DISCOM architecture.

Current state: Returns mock "normal" grid status.
Future: Abstract GridDataSource interface with DiscomAPISource
for real-time grid frequency/voltage data from NRLDC/State LDCs.

Override hierarchy:
  Grid Protection (critical severity) overrides all AI strategy actions
  EXCEPT physical user override — if user turns on via switch, respect it.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional
import logging

from app.database import get_supabase
from app.adapters import get_adapter

logger = logging.getLogger("voltwise.grid_protection")


# ── Abstract Grid Data Source ───────────────────────────────────────

class GridDataSource(ABC):
    """Abstract interface for grid status providers."""

    @abstractmethod
    async def get_status(self, discom_id: str) -> dict:
        """
        Returns grid status dict:
        {
            "status": "normal" | "stressed" | "critical",
            "frequency_hz": float,
            "voltage_v": float,
            "message": str | None,
        }
        """
        ...

    @abstractmethod
    async def get_active_events(self, discom_id: str) -> list[dict]:
        """Get any active grid events from this source."""
        ...


class MockGridSource(GridDataSource):
    """
    Mock implementation — always returns normal grid status.
    For PoC testing and development.
    """

    async def get_status(self, discom_id: str) -> dict:
        return {
            "status": "normal",
            "frequency_hz": 50.02,
            "voltage_v": 230.5,
            "message": None,
        }

    async def get_active_events(self, discom_id: str) -> list[dict]:
        return []


class DiscomAPISource(GridDataSource):
    """
    Placeholder for future DISCOM/NRLDC API integration.

    When implemented, this will:
    1. Poll NRLDC real-time frequency data (https://nrldc.in)
    2. Check SLDC load dispatch center for state-level alerts
    3. Integrate with DISCOM's DR (Demand Response) API if available

    Data points to fetch:
    - Grid frequency (target: 50.00 Hz, alarm < 49.90 or > 50.05)
    - State-level voltage at key substations
    - Load shedding schedules from DISCOM
    - Demand-response event signals
    """

    def __init__(self, api_url: str = "", api_key: str = ""):
        self.api_url = api_url
        self.api_key = api_key

    async def get_status(self, discom_id: str) -> dict:
        # TODO: Implement real API call
        # Example:
        # response = await httpx.AsyncClient().get(
        #     f"{self.api_url}/grid/status",
        #     params={"discom": discom_id},
        #     headers={"X-API-Key": self.api_key},
        # )
        # return response.json()
        logger.warning("[GridProtection] DiscomAPISource not yet implemented, using mock")
        return await MockGridSource().get_status(discom_id)

    async def get_active_events(self, discom_id: str) -> list[dict]:
        logger.warning("[GridProtection] DiscomAPISource not yet implemented, using mock")
        return []


# ── Grid Protection Service Functions ───────────────────────────────

# Global data source instance — swap MockGridSource for DiscomAPISource when ready
_grid_source: GridDataSource = MockGridSource()


def set_grid_source(source: GridDataSource):
    """Replace the grid data source (for testing or production)."""
    global _grid_source
    _grid_source = source


async def check_grid_status(discom_id: str) -> dict:
    """
    Check current grid health for a DISCOM.
    Also checks the `grid_events` table for any active events.
    """
    # Get live/mock status
    live_status = await _grid_source.get_status(discom_id)

    # Check DB for active grid events
    db = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    events_result = db.table("grid_events").select("*").eq(
        "discom_id", discom_id
    ).eq("is_active", True).lte(
        "start_time", now_iso
    ).execute()

    active_events = []
    for event in (events_result.data or []):
        # Check if event hasn't expired
        end_time = event.get("end_time")
        if end_time and end_time < now_iso:
            # Expire the event
            db.table("grid_events").update({"is_active": False}).eq("id", event["id"]).execute()
            continue
        active_events.append(event)

    # Determine overall status
    has_critical = any(e["severity"] == "critical" for e in active_events)
    has_warning = any(e["severity"] == "warning" for e in active_events)

    overall_status = live_status["status"]
    if has_critical:
        overall_status = "critical"
    elif has_warning and overall_status == "normal":
        overall_status = "stressed"

    return {
        **live_status,
        "status": overall_status,
        "active_events": active_events,
        "event_count": len(active_events),
    }


async def handle_grid_event(event: dict, home_ids: list[str] | None = None) -> dict:
    """
    Process a grid event — emergency actions for affected homes.

    Grid protection overrides strategy and protected windows
    (but NOT physical user override).

    Args:
        event: grid_events row dict
        home_ids: specific homes to protect, or None for all homes under this DISCOM
    """
    db = get_supabase()
    severity = event.get("severity", "info")
    discom_id = event.get("discom_id")
    actions_taken = []

    if severity not in ("warning", "critical"):
        logger.info(f"[GridProtection] Info-level event, no action needed: {event.get('message')}")
        return {"actions": [], "message": "Info-level event, no action taken"}

    # Find affected homes
    if home_ids is None and discom_id:
        homes_result = db.table("homes").select(
            "id, user_id"
        ).eq("grid_protection_enabled", True).execute()
        # Filter to homes under this DISCOM
        # (simplified: for PoC, protect all homes with grid_protection_enabled)
        homes = homes_result.data or []
    else:
        homes = []
        for hid in (home_ids or []):
            h_result = db.table("homes").select("id, user_id").eq("id", hid).limit(1).execute()
            if h_result.data:
                homes.extend(h_result.data)

    for home in homes:
        home_id = home["id"]
        user_id = home.get("user_id")

        # Get all delegated devices for this home
        configs_result = db.table("device_autopilot_config").select(
            "*, appliances(id, name, status, is_controllable)"
        ).eq("home_id", home_id).eq("is_delegated", True).execute()

        for config in (configs_result.data or []):
            appliance = config.get("appliances")
            if not appliance:
                continue

            # Skip if user has physical override
            if config.get("override_active", False):
                logger.info(
                    f"[GridProtection] Skipping {appliance['name']} — user override active"
                )
                continue

            # Skip if already OFF
            if appliance["status"] == "OFF":
                continue

            # Skip non-controllable
            if not appliance.get("is_controllable", True):
                continue

            try:
                adapter = get_adapter(appliance)
                # Critical: always turn off for grid protection
                result = await adapter.turn_off(appliance["id"])

                # Save state for later restoration
                db.table("autopilot_saved_state").upsert({
                    "home_id": home_id,
                    "appliance_id": appliance["id"],
                    "prev_status": appliance["status"],
                    "trigger_type": "grid_event",
                    "saved_at": datetime.now(timezone.utc).isoformat(),
                    "restored_at": None,
                }, on_conflict="home_id,appliance_id,trigger_type").execute()

                actions_taken.append({
                    "home_id": home_id,
                    "appliance_id": appliance["id"],
                    "name": appliance["name"],
                    "action": "emergency_off",
                    "success": result.success,
                })

                logger.info(
                    f"[GridProtection] Emergency OFF: {appliance['name']} "
                    f"(home {home_id}, severity: {severity})"
                )
            except Exception as e:
                logger.error(f"[GridProtection] Failed to turn off {appliance['id']}: {e}")
                actions_taken.append({
                    "home_id": home_id,
                    "appliance_id": appliance["id"],
                    "name": appliance.get("name"),
                    "action": "emergency_off",
                    "success": False,
                    "error": str(e),
                })

        # Notify user
        if user_id and any(a["success"] for a in actions_taken if a.get("home_id") == home_id):
            count = len([a for a in actions_taken if a.get("home_id") == home_id and a["success"]])
            db.table("notifications").insert({
                "user_id": user_id,
                "type": "system",
                "title": "🛡️ Grid Protection Activated",
                "message": (
                    f"Emergency grid event detected. Turned off {count} appliance(s) "
                    f"to protect your home and the grid."
                ),
                "icon": "shield",
                "color": "text-rose-600",
                "bg_color": "bg-rose-50",
                "metadata": {"grid_event_id": event.get("id"), "severity": severity},
            }).execute()

    return {
        "actions": actions_taken,
        "homes_affected": len(homes),
        "message": f"Grid protection: {len(actions_taken)} actions across {len(homes)} home(s)",
    }


async def restore_after_grid_event(discom_id: str) -> dict:
    """
    Restore appliances after a grid event clears.
    Similar to execute_strategy_restore but for grid_event trigger type.
    """
    db = get_supabase()
    actions_taken = []

    # Find all saved states for grid events
    saved = db.table("autopilot_saved_state").select(
        "*, appliances(id, name, status, is_controllable)"
    ).eq("trigger_type", "grid_event").is_(
        "restored_at", "null"
    ).execute()

    for entry in (saved.data or []):
        appliance = entry.get("appliances")
        if not appliance:
            continue

        prev_status = entry["prev_status"]
        if prev_status not in ("ON", "WARNING"):
            continue

        # Skip if user already turned it on
        if appliance["status"] == "ON":
            db.table("autopilot_saved_state").update({
                "restored_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", entry["id"]).execute()
            continue

        try:
            adapter = get_adapter(appliance)
            result = await adapter.turn_on(appliance["id"])

            db.table("autopilot_saved_state").update({
                "restored_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", entry["id"]).execute()

            actions_taken.append({
                "appliance_id": appliance["id"],
                "name": appliance["name"],
                "action": "restore_on",
                "success": result.success,
            })
        except Exception as e:
            logger.error(f"[GridProtection] Failed to restore {appliance['id']}: {e}")

    return {"actions": actions_taken, "message": f"Restored {len(actions_taken)} appliances after grid event"}
