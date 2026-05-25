"""
Supabase client (admin / service-role).

Uses the SERVICE_ROLE_KEY so the backend can bypass RLS
for schedule execution, notifications, and status updates.
"""

from __future__ import annotations

import base64
import json

from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None


def _jwt_role(key: str) -> str | None:
    """Read the `role` claim from a Supabase JWT (no signature verify)."""
    try:
        parts = key.split(".")
        if len(parts) != 3:
            return None
        padding = 4 - len(parts[1]) % 4
        payload = parts[1] + ("=" * padding)
        data = json.loads(base64.urlsafe_b64decode(payload))
        return data.get("role")
    except Exception:
        return None


def _validate_service_role_key(key: str) -> None:
    role = _jwt_role(key)
    if role == "service_role":
        return
    if role == "anon":
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY in backend/.env is the ANON key, not service_role. "
            "Supabase Dashboard → Project Settings → API → copy the service_role secret "
            "(never put service_role in the frontend .env.local)."
        )
    if role:
        raise RuntimeError(
            f"SUPABASE_SERVICE_ROLE_KEY has role '{role}', expected 'service_role'."
        )


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        if not s.supabase_url or not s.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _validate_service_role_key(s.supabase_service_role_key)
        _client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _client
