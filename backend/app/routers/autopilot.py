"""
Autopilot Router — Manage automation rules + enable/disable autopilot.

Endpoints:
  GET    /api/autopilot/rules          — List all rules for user's home
  POST   /api/autopilot/rules          — Create a new automation rule
  PUT    /api/autopilot/rules/{id}     — Update a rule
  DELETE /api/autopilot/rules/{id}     — Delete a rule
  POST   /api/autopilot/toggle         — Enable/disable autopilot for home
  GET    /api/autopilot/status         — Get autopilot status + summary
  POST   /api/autopilot/simulate       — Dry-run: show what would happen at peak
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import get_supabase
from app.routers.appliances import get_current_user

logger = logging.getLogger("voltwise.routers.autopilot")

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])


# ── Models ──────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    home_id: str
    name: str
    description: Optional[str] = None
    condition_type: str = "peak_tariff"  # "peak_tariff" | "budget_limit" | "grid_event"
    condition_value: dict = {}           # e.g. {"min_rate": 9.0}
    target_appliance_ids: list[str] = []
    action: str = "turn_off"             # "turn_off" | "eco_mode" | "reduce_power"
    is_active: bool = True


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    condition_value: Optional[dict] = None
    target_appliance_ids: Optional[list[str]] = None
    action: Optional[str] = None
    is_active: Optional[bool] = None


class RuleResponse(BaseModel):
    id: str
    home_id: str
    name: str
    description: Optional[str]
    condition_type: str
    condition_value: dict
    target_appliance_ids: list[str]
    action: str
    is_active: bool
    is_triggered: bool
    last_triggered: Optional[str]


class AutopilotToggle(BaseModel):
    home_id: str
    enabled: bool


class AutopilotStatus(BaseModel):
    enabled: bool
    rules_count: int
    active_rules: int
    triggered_rules: int
    protected_appliances: int
    mode: str  # "peak_optimization" | "disabled"


class SimulationResult(BaseModel):
    would_affect: list[dict]
    total_savings_estimate: float
    message: str


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("/rules", response_model=list[RuleResponse])
async def list_rules(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """List all automation rules for a home."""
    db = get_supabase()
    result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).order("created_at", desc=True).execute()

    return [_to_rule_response(r) for r in (result.data or [])]


@router.post("/rules", response_model=RuleResponse)
async def create_rule(
    body: RuleCreate,
    user: dict = Depends(get_current_user),
):
    """Create a new automation rule."""
    db = get_supabase()

    data = {
        "home_id": body.home_id,
        "name": body.name,
        "description": body.description,
        "condition_type": body.condition_type,
        "condition_value": body.condition_value,
        "target_appliance_ids": body.target_appliance_ids,
        "action": body.action,
        "is_active": body.is_active,
        "is_triggered": False,
    }

    result = db.table("automation_rules").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create rule")

    return _to_rule_response(result.data[0])


@router.put("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: str,
    body: RuleUpdate,
    user: dict = Depends(get_current_user),
):
    """Update an existing automation rule."""
    db = get_supabase()

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = db.table("automation_rules").update(update_data).eq("id", rule_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Rule not found")

    return _to_rule_response(result.data[0])


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete an automation rule."""
    db = get_supabase()
    db.table("automation_rules").delete().eq("id", rule_id).execute()
    return {"success": True, "message": "Rule deleted"}


@router.post("/toggle")
async def toggle_autopilot(
    body: AutopilotToggle,
    user: dict = Depends(get_current_user),
):
    """
    Enable or disable autopilot for a home.
    When disabled: deactivates all automation_rules for the home.
    When enabled: reactivates rules (or user creates new ones).
    """
    db = get_supabase()

    # Store autopilot state in homes table metadata
    db.table("homes").update({
        "autopilot_enabled": body.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.home_id).execute()

    # If disabling, un-trigger all rules (but keep them for re-enable)
    if not body.enabled:
        db.table("automation_rules").update({
            "is_triggered": False,
        }).eq("home_id", body.home_id).execute()

    return {
        "success": True,
        "enabled": body.enabled,
        "message": f"Autopilot {'enabled' if body.enabled else 'disabled'}",
    }


@router.get("/status", response_model=AutopilotStatus)
async def get_status(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get autopilot status and summary for a home."""
    db = get_supabase()

    # Check if autopilot is enabled on the home
    home_result = db.table("homes").select("autopilot_enabled").eq(
        "id", home_id
    ).limit(1).execute()

    enabled = False
    if home_result.data:
        enabled = home_result.data[0].get("autopilot_enabled", False) or False

    # Fetch rules
    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).execute()
    rules = rules_result.data or []

    active_rules = [r for r in rules if r.get("is_active")]
    triggered_rules = [r for r in rules if r.get("is_triggered")]

    # Count unique appliances protected
    all_appliance_ids = set()
    for r in active_rules:
        for aid in (r.get("target_appliance_ids") or []):
            all_appliance_ids.add(aid)

    return AutopilotStatus(
        enabled=enabled,
        rules_count=len(rules),
        active_rules=len(active_rules),
        triggered_rules=len(triggered_rules),
        protected_appliances=len(all_appliance_ids),
        mode="peak_optimization" if enabled else "disabled",
    )


@router.post("/simulate", response_model=SimulationResult)
async def simulate_peak(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """
    Simulate what would happen if peak tariff started right now.
    Doesn't execute anything — just shows what autopilot would do.
    """
    db = get_supabase()

    # Fetch active rules
    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()
    rules = rules_result.data or []

    # Fetch appliances
    app_result = db.table("appliances").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()
    appliances = {a["id"]: a for a in (app_result.data or [])}

    would_affect = []
    total_savings = 0.0

    for rule in rules:
        if rule["condition_type"] != "peak_tariff":
            continue
        for aid in (rule.get("target_appliance_ids") or []):
            if aid not in appliances:
                continue
            app = appliances[aid]
            if app["status"] in ("ON", "WARNING"):
                # Estimate hourly savings = power_w / 1000 * peak_rate_delta
                power_kw = app.get("rated_power_w", 0) / 1000
                savings = power_kw * 3.24  # peak vs off-peak delta (9.55 - 6.31)
                would_affect.append({
                    "appliance_id": aid,
                    "name": app.get("name"),
                    "current_status": app["status"],
                    "action": rule["action"],
                    "hourly_savings": round(savings, 2),
                })
                total_savings += savings

    return SimulationResult(
        would_affect=would_affect,
        total_savings_estimate=round(total_savings, 2),
        message=f"Would manage {len(would_affect)} appliance(s), saving ~₹{total_savings:.1f}/hr",
    )


def _to_rule_response(r: dict) -> RuleResponse:
    return RuleResponse(
        id=r["id"],
        home_id=r["home_id"],
        name=r["name"],
        description=r.get("description"),
        condition_type=r["condition_type"],
        condition_value=r.get("condition_value", {}),
        target_appliance_ids=r.get("target_appliance_ids", []),
        action=r["action"],
        is_active=r.get("is_active", True),
        is_triggered=r.get("is_triggered", False),
        last_triggered=r.get("last_triggered"),
    )
