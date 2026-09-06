"""
Supabase client (admin / service-role).

Uses the SERVICE_ROLE_KEY so the backend can bypass RLS
for schedule execution, notifications, and status updates.
"""

from supabase import create_client, Client
from app.config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        if not s.supabase_url or not s.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _client
