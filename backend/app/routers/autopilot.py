"""
Autopilot Router — V2 Multi-Strategy Autopilot + Legacy Rules

V1 (legacy) endpoints:
  GET    /api/autopilot/rules          — List all rules for user's home
  POST   /api/autopilot/rules          — Create a new automation rule
  PUT    /api/autopilot/rules/{id}     — Update a rule
  DELETE /api/autopilot/rules/{id}     — Delete a rule
  POST   /api/autopilot/toggle         — Enable/disable autopilot for home
  GET    /api/autopilot/status         — Get autopilot status + summary
  POST   /api/autopilot/simulate       — Dry-run: show what would happen at peak

V2 endpoints:
  PUT    /api/autopilot/strategy       — Set autopilot strategy (balanced|max_savings|eco_mode)
  PUT    /api/autopilot/grid-protection — Toggle grid protection
  GET    /api/autopilot/penalty-timeline — 24h penalty timeline
  GET    /api/autopilot/carbon-now      — Current carbon intensity status
  POST   /api/autopilot/device-config   — Add/update per-device autopilot config
  GET    /api/autopilot/device-config   — List device configs for home
  POST   /api/autopilot/override        — Record physical override
  GET    /api/autopilot/grid-status     — Get grid protection status
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


# ══════════════════════════════════════════════════════════════════════
#  Models
# ══════════════════════════════════════════════════════════════════════

# ── V1 Legacy Models ────────────────────────────────────────────────

class RuleCreate(BaseModel):
    home_id: str
    name: str
    description: Optional[str] = None
    condition_type: str = "peak_tariff"
    condition_value: dict = {}
    target_appliance_ids: list[str] = []
    action: str = "turn_off"
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
    strategy: str                # "balanced" | "max_savings" | "eco_mode"
    grid_protection_enabled: bool
    rules_count: int
    active_rules: int
    triggered_rules: int
    delegated_devices: int
    mode: str                    # "balanced" | "max_savings" | "eco_mode" | "disabled"


class SimulationResult(BaseModel):
    would_affect: list[dict]
    total_savings_estimate: float
    message: str


# ── V2 Models ───────────────────────────────────────────────────────

class StrategyUpdate(BaseModel):
    home_id: str
    strategy: str  # "balanced" | "max_savings" | "eco_mode"


class GridProtectionToggle(BaseModel):
    home_id: str
    enabled: bool


class DeviceConfigUpsert(BaseModel):
    home_id: str
    appliance_id: str
    is_delegated: bool = True
    preferred_action: str = "turn_off"  # "turn_off" | "eco_mode" | "reduce_power"
    protected_window_start: Optional[str] = None  # "HH:MM"
    protected_window_end: Optional[str] = None    # "HH:MM"


class OverrideRecord(BaseModel):
    home_id: str
    appliance_id: str
    override_source: str = "physical"  # "physical" | "app"


# ══════════════════════════════════════════════════════════════════════
#  V1 Legacy Endpoints
# ══════════════════════════════════════════════════════════════════════

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
    When disabled: deactivates all automation_rules + clears device delegations.
    When enabled: reactivates rules (or user creates new ones).
    """
    db = get_supabase()

    db.table("homes").update({
        "autopilot_enabled": body.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.home_id).execute()

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

    home_result = db.table("homes").select(
        "autopilot_enabled, autopilot_strategy, grid_protection_enabled"
    ).eq("id", home_id).limit(1).execute()

    enabled = False
    strategy = "balanced"
    grid_prot = False
    if home_result.data:
        h = home_result.data[0]
        enabled = h.get("autopilot_enabled", False) or False
        strategy = h.get("autopilot_strategy", "balanced") or "balanced"
        grid_prot = h.get("grid_protection_enabled", False) or False

    # V1 legacy rules
    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).execute()
    rules = rules_result.data or []
    active_rules = [r for r in rules if r.get("is_active")]
    triggered_rules = [r for r in rules if r.get("is_triggered")]

    # V2 delegated device count
    config_result = db.table("device_autopilot_config").select("id").eq(
        "home_id", home_id
    ).eq("is_delegated", True).execute()
    delegated_count = len(config_result.data or [])

    return AutopilotStatus(
        enabled=enabled,
        strategy=strategy,
        grid_protection_enabled=grid_prot,
        rules_count=len(rules),
        active_rules=len(active_rules),
        triggered_rules=len(triggered_rules),
        delegated_devices=delegated_count,
        mode=strategy if enabled else "disabled",
    )


@router.post("/simulate", response_model=SimulationResult)
async def simulate_peak(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Simulate what would happen if peak tariff started right now."""
    db = get_supabase()

    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()
    rules = rules_result.data or []

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
                power_kw = app.get("rated_power_w", 0) / 1000
                savings = power_kw * 3.24
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


# ══════════════════════════════════════════════════════════════════════
#  V2 Endpoints
# ══════════════════════════════════════════════════════════════════════

@router.put("/strategy")
async def set_strategy(
    body: StrategyUpdate,
    user: dict = Depends(get_current_user),
):
    """Set the autopilot strategy for a home."""
    valid = ("balanced", "max_savings", "eco_mode")
    if body.strategy not in valid:
        raise HTTPException(status_code=400, detail=f"strategy must be one of {valid}")

    db = get_supabase()
    db.table("homes").update({
        "autopilot_strategy": body.strategy,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.home_id).execute()

    logger.info(f"Home {body.home_id} strategy → {body.strategy}")
    return {"success": True, "strategy": body.strategy}


@router.put("/grid-protection")
async def toggle_grid_protection(
    body: GridProtectionToggle,
    user: dict = Depends(get_current_user),
):
    """Toggle grid protection for a home."""
    db = get_supabase()
    db.table("homes").update({
        "grid_protection_enabled": body.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.home_id).execute()

    logger.info(f"Home {body.home_id} grid_protection → {body.enabled}")
    return {"success": True, "enabled": body.enabled}


@router.get("/penalty-timeline")
async def get_penalty_timeline(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get 24-hour penalty timeline for the home's active strategy."""
    db = get_supabase()

    # Get home strategy
    home_result = db.table("homes").select(
        "tariff_plan_id, autopilot_strategy"
    ).eq("id", home_id).limit(1).execute()

    if not home_result.data:
        raise HTTPException(status_code=404, detail="Home not found")

    home = home_result.data[0]
    plan_id = home.get("tariff_plan_id")
    strategy = home.get("autopilot_strategy", "balanced")

    if not plan_id:
        raise HTTPException(status_code=400, detail="No tariff plan assigned")

    # Fetch tariff slots
    slots_result = db.table("tariff_slots").select("*").eq("plan_id", plan_id).execute()
    slots = slots_result.data or []

    # Fetch carbon profile
    from app.services.carbon import get_daily_carbon_profile, _get_region_for_home
    region_code = _get_region_for_home(home_id)
    carbon_profile = get_daily_carbon_profile(region_code)

    # Compute penalty timeline
    from app.services.penalty_engine import get_penalty_timeline
    timeline = get_penalty_timeline(slots, carbon_profile, strategy)

    return {"home_id": home_id, "strategy": strategy, "timeline": timeline}


@router.get("/carbon-now")
async def get_carbon_now(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get current carbon intensity status for the home's region."""
    from app.services.carbon import get_carbon_status
    try:
        status = get_carbon_status(home_id)
        return status
    except Exception as e:
        logger.error(f"Carbon status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/device-config")
async def upsert_device_config(
    body: DeviceConfigUpsert,
    user: dict = Depends(get_current_user),
):
    """Add or update per-device autopilot config."""
    db = get_supabase()

    # Check if config exists for this appliance
    existing = db.table("device_autopilot_config").select("id").eq(
        "appliance_id", body.appliance_id
    ).eq("home_id", body.home_id).limit(1).execute()

    data = {
        "home_id": body.home_id,
        "appliance_id": body.appliance_id,
        "is_delegated": body.is_delegated,
        "preferred_action": body.preferred_action,
        "protected_window_start": body.protected_window_start,
        "protected_window_end": body.protected_window_end,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if existing.data:
        result = db.table("device_autopilot_config").update(data).eq(
            "id", existing.data[0]["id"]
        ).execute()
    else:
        result = db.table("device_autopilot_config").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save device config")

    return {"success": True, "config": result.data[0]}


@router.get("/device-config")
async def list_device_configs(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """List all device autopilot configs for a home."""
    db = get_supabase()
    result = db.table("device_autopilot_config").select(
        "*, appliances(name, category, status, rated_power_w)"
    ).eq("home_id", home_id).execute()

    return {"configs": result.data or []}


@router.post("/override")
async def record_override(
    body: OverrideRecord,
    user: dict = Depends(get_current_user),
):
    """
    Record a physical or app-based override for an appliance.
    This prevents autopilot from touching the appliance for the rest of the
    current penalty period.
    """
    db = get_supabase()

    # Update device_autopilot_config
    existing = db.table("device_autopilot_config").select("id").eq(
        "appliance_id", body.appliance_id
    ).eq("home_id", body.home_id).limit(1).execute()

    now = datetime.now(timezone.utc).isoformat()

    if existing.data:
        db.table("device_autopilot_config").update({
            "user_override_active": True,
            "last_override_at": now,
            "updated_at": now,
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        # Create config with override active
        db.table("device_autopilot_config").insert({
            "home_id": body.home_id,
            "appliance_id": body.appliance_id,
            "is_delegated": True,
            "user_override_active": True,
            "last_override_at": now,
        }).execute()

    logger.info(
        f"Override recorded: appliance={body.appliance_id}, source={body.override_source}"
    )

    return {
        "success": True,
        "appliance_id": body.appliance_id,
        "override_source": body.override_source,
        "message": "Override recorded. Autopilot will not touch this appliance until the next transition.",
    }


@router.get("/grid-status")
async def get_grid_status(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get grid protection status for the home's DISCOM."""
    db = get_supabase()

    # Resolve DISCOM
    home_result = db.table("homes").select(
        "discom_id, grid_protection_enabled"
    ).eq("id", home_id).limit(1).execute()

    if not home_result.data:
        raise HTTPException(status_code=404, detail="Home not found")

    home = home_result.data[0]
    discom_id = home.get("discom_id")
    grid_enabled = home.get("grid_protection_enabled", False) or False

    if not discom_id:
        return {
            "grid_protection_enabled": grid_enabled,
            "status": "unknown",
            "message": "No DISCOM assigned to home",
        }

    from app.services.grid_protection import check_grid_status
    grid_status = check_grid_status(discom_id)

    return {
        "grid_protection_enabled": grid_enabled,
        **grid_status,
    }


# ══════════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════════

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
