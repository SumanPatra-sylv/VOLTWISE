"""
VoltWise Backend — Configuration

Loads environment variables via pydantic-settings.
All secrets come from .env (never committed).
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Tuya Smart Plug (optional)
    tuya_access_id: str = ""
    tuya_access_secret: str = ""
    tuya_api_endpoint: str = "https://openapi.tuyain.com"
    tuya_device_region: str = "in"

    # Server
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    timezone: str = "Asia/Kolkata"

    # APScheduler
    scheduler_db_url: str = ""  # Empty = in-memory (PoC)

    # Gemini AI (optional)
    gemini_api_key: str = ""

    # NILM Replay Configuration
    replay_data_path: str = "nilm-project/data/processed/replay_windows.npy"
    replay_mode_enabled: bool = True
    window_size: int = 60
    sample_interval_seconds: int = 5
    replay_loop_enabled: bool = True
    noise_enabled: bool = False
    noise_stddev: float = 5.0
    max_valid_power_w: float = 20000.0

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
