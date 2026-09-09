"""
Billing Router — Dynamic bill calculation via the Billing Engine.

Endpoints:
  GET /api/billing/monthly-summary  — 12-month summary for chart + bill list
  GET /api/billing/bill-data        — Full bill data for a single month (PDF-ready)
  GET /api/billing/effective-rates   — Current slab + ToD rates for UI display

All calculations use interval_readings (15-min intervals) as the primary
data source, falling back to daily_aggregates when no interval data exists.

NOTE: Handlers use plain `def` (not `async def`) because the billing engine
makes synchronous Supabase calls. FastAPI auto-runs `def` handlers in a
thread pool, preventing event-loop blocking.
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Query, HTTPException

from app.services.billing_engine import (
    calculate_yearly_summary,
    calculate_monthly_bill,
    get_effective_rates,
    get_bill_pdf_data,
)

logger = logging.getLogger("voltwise.billing_router")

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/monthly-summary")
def monthly_summary(
    home_id: str = Query(..., description="Home ID"),
    year: int = Query(..., ge=2020, le=2030, description="Year"),
):
    """
    Returns 12-month billing summary for the given year.
    Drives the annual chart and bill cards in BillHistory.tsx.
    """
    try:
        result = calculate_yearly_summary(home_id, year)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[BillingRouter] monthly-summary error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to calculate billing summary")


@router.get("/bill-data")
def bill_data(
    home_id: str = Query(..., description="Home ID"),
    year: int = Query(..., ge=2020, le=2030, description="Year"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
):
    """
    Returns full bill data for a single month, including slab breakdown,
    ToD adjustments, taxes, daily audit trail, and consumer details.
    Used by the frontend to generate PDF bills.
    """
    try:
        result = get_bill_pdf_data(home_id, year, month)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[BillingRouter] bill-data error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to calculate bill")


@router.get("/effective-rates")
def effective_rates(
    home_id: str = Query(..., description="Home ID"),
):
    """
    Returns current effective rates: base slab rates + ToD modifiers.
    For UI display in the tariff info panel.
    """
    try:
        result = get_effective_rates(home_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[BillingRouter] effective-rates error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch rates")
