"""
NILM Service — Real-time power analytics using XGBoost models + Smart Plug data.

Architecture:
  - SyntheticMeterGenerator: produces fake aggregate meter data (demo mode)
  - NilmDisaggregator: loads real XGBoost .joblib models, runs inference
  - SmartPlugReader: reads from smart plug (demo / Tuya adapter)
  - PowerAnalyticsService: orchestrator — merges smart plug + NILM data
"""

from __future__ import annotations
import logging
import math
import random
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from abc import ABC, abstractmethod
import json

import numpy as np
from scipy import stats
try:
    from supabase import create_client
except ImportError:
    create_client = None  # type: ignore

logger = logging.getLogger("voltwise.nilm")


class TelemetryUnavailableError(Exception):
    """Raised when telemetry source is missing, corrupt, or unreachable."""
    pass


class MalformedTelemetryError(ValueError):
    """Raised when a retrieved telemetry window fails strict contract validation."""
    pass

# ── Paths ──────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # VOLTWISE/
MODELS_DIR = PROJECT_ROOT / "nilm-project" / "models" / "edge"

# ── Appliance Profiles ─────────────────────────────────────────────

APPLIANCE_PROFILES = {
    "ac": {
        "label": "Air Conditioner",
        "category": "ac",
        "rated_watts": 1500,
        "on_range": (1200, 1800),
        "duty_cycle": 0.9,           # 90% ON during active hours (demo)
        "active_hours": (10, 23),    # 10 AM to 11 PM
    },
    "fridge": {
        "label": "Refrigerator",
        "category": "refrigerator",
        "rated_watts": 150,
        "on_range": (80, 180),
        "duty_cycle": 0.7,           # Compressor cycles — 70% ON
        "active_hours": (0, 24),     # Always on (cycling)
    },
    "washing_machine": {
        "label": "Washing Machine",
        "category": "washing_machine",
        "rated_watts": 500,
        "on_range": (350, 600),
        "duty_cycle": 0.2,           # Rarely running
        "active_hours": (7, 20),
    },
    "television": {
        "label": "Television",
        "category": "tv",
        "rated_watts": 100,
        "on_range": (60, 120),
        "duty_cycle": 0.85,          # 85% ON during evening
        "active_hours": (17, 24),    # Evening hours
    },
}


# ── Feature Extraction (mirrors inference_edge.py) ─────────────────

FEATURE_NAMES = [
    "mean", "std", "min", "max", "median",
    "p10", "p25", "p75", "p90",
    "range", "iqr",
    "skew", "kurtosis",
    "coef_var",
    "diff_mean", "diff_max", "diff_std",
    "zero_crossings",
    "rms",
]


def extract_features(window: np.ndarray) -> dict[str, float] | None:
    """Extract statistical features from a power window. Same logic as inference_edge.py."""
    if len(window) == 0 or np.all(np.isnan(window)):
        return None

    clean = window[~np.isnan(window)]
    if len(clean) < 10:
        return None

    features: dict[str, float] = {}

    # Basic statistics
    features["mean"] = float(np.mean(clean))
    features["std"] = float(np.std(clean))
    features["min"] = float(np.min(clean))
    features["max"] = float(np.max(clean))
    features["median"] = float(np.median(clean))

    # Percentiles
    features["p10"] = float(np.percentile(clean, 10))
    features["p25"] = float(np.percentile(clean, 25))
    features["p75"] = float(np.percentile(clean, 75))
    features["p90"] = float(np.percentile(clean, 90))

    # Range and IQR
    features["range"] = features["max"] - features["min"]
    features["iqr"] = features["p75"] - features["p25"]

    # Shape statistics
    features["skew"] = float(stats.skew(clean)) if len(clean) > 2 else 0.0
    features["kurtosis"] = float(stats.kurtosis(clean)) if len(clean) > 3 else 0.0

    # Variability
    features["coef_var"] = features["std"] / features["mean"] if features["mean"] > 0 else 0.0

    # Differences
    if len(clean) > 1:
        diffs = np.diff(clean)
        features["diff_mean"] = float(np.mean(np.abs(diffs)))
        features["diff_max"] = float(np.max(np.abs(diffs)))
        features["diff_std"] = float(np.std(diffs))
    else:
        features["diff_mean"] = 0.0
        features["diff_max"] = 0.0
        features["diff_std"] = 0.0

    # Zero crossings
    if len(clean) > 2:
        diffs = np.diff(clean)
        features["zero_crossings"] = float(np.sum(np.diff(np.sign(diffs)) != 0))
    else:
        features["zero_crossings"] = 0.0

    # RMS
    features["rms"] = float(np.sqrt(np.mean(clean ** 2)))

    return features


# ── Synthetic Meter Generator ──────────────────────────────────────

class TelemetrySource(ABC):
    """Abstract Base Class defining the contract for telemetry ingest."""
    
    @abstractmethod
    def initialize(self) -> None:
        """Deterministic startup validation and loading."""
        pass
        
    @abstractmethod
    def get_current_window(self) -> np.ndarray:
        """Return a 60-sample window of aggregate active power (W)."""
        pass
        
    @abstractmethod
    def get_health_status(self) -> dict[str, Any]:
        """Return diagnostics about source operations."""
        pass


class ReplayTelemetrySource(TelemetrySource):
    """Production-grade telemetry replay source using held-out real data."""
    
    def __init__(self, settings: Any):
        self.settings = settings
        self._windows: np.ndarray | None = None
        self._metadata: dict[str, Any] = {}
        self._index = 0
        self._initialized = False
        self._health = "UNKNOWN"
        self._failure_count = 0
        self._last_read_time: datetime | None = None
        self._total_windows = 0

    def initialize(self) -> None:
        if self._initialized:
            return
        try:
            data_path = PROJECT_ROOT / self.settings.replay_data_path
            meta_path = data_path.with_name("replay_metadata.json")
            
            if not data_path.exists():
                raise FileNotFoundError(f"Replay data file not found at {data_path}")
                
            self._windows = np.load(data_path)
            self._total_windows = len(self._windows)
            
            if meta_path.exists():
                with open(meta_path, "r") as f:
                    self._metadata = json.load(f)
                    
            if self._windows.ndim != 2 or self._windows.shape[1] != self.settings.window_size:
                raise ValueError(f"Invalid replay window shape: {self._windows.shape}")
                
            self._health = "HEALTHY"
            self._initialized = True
            logger.info("[STARTUP] ReplayTelemetrySource successfully initialized with %d windows", self._total_windows)
        except Exception as e:
            self._health = "FAILED"
            self._failure_count += 1
            logger.error("[STARTUP] Failed to initialize ReplayTelemetrySource: %s", e)
            raise TelemetryUnavailableError(f"Telemetry source failed initialization: {e}") from e

    def get_current_window(self) -> np.ndarray:
        if not self._initialized:
            self.initialize()
            
        if self._windows is None or len(self._windows) == 0:
            raise TelemetryUnavailableError("Replay data is empty or not loaded")
            
        window = self._windows[self._index].copy()
        self._index = (self._index + 1) % self._total_windows
        
        if self.settings.noise_enabled:
            noise = np.random.normal(0, self.settings.noise_stddev, len(window))
            window = window + noise
            
        # Clip aggregate power so it's never negative after adding noise
        window = np.clip(window, 0.0, None)
            
        self._last_read_time = datetime.now()
        return window

    def get_health_status(self) -> dict[str, Any]:
        return {
            "status": self._health,
            "total_windows": self._total_windows,
            "current_index": self._index,
            "last_read_time": self._last_read_time.isoformat() if self._last_read_time else None,
            "failure_count": self._failure_count
        }


def validate_window(window: np.ndarray, expected_size: int = 60, max_valid_power_w: float = 20000.0) -> bool:
    """Enforce exact window length, no NaN/Inf, and residential active power limits."""
    if window is None:
        logger.error("[VALIDATION] Window is None")
        return False
    if len(window) != expected_size:
        logger.error("[VALIDATION] Size %d, expected %d", len(window), expected_size)
        return False
    if np.any(np.isnan(window)) or np.any(np.isinf(window)):
        logger.error("[VALIDATION] Window contains NaN or Inf values")
        return False
    # Clamp or reject extreme values (0W to 20kW residential envelope)
    if np.any(window < 0.0) or np.any(window > max_valid_power_w):
        logger.error("[VALIDATION] Window contains power values outside residential limit [0W - %dW]", max_valid_power_w)
        return False
    return True


# ── NILM Disaggregator (Real XGBoost Models) ──────────────────────

class NilmDisaggregator:
    """Loads real XGBoost .joblib models and runs inference."""

    def __init__(self):
        self._models: dict[str, dict] = {}
        self._feature_columns: list[str] = FEATURE_NAMES
        self._loaded = False

    def load_models(self):
        """Load all XGBoost models from disk."""
        if self._loaded:
            return

        try:
            import joblib
        except ImportError:
            logger.error("joblib not installed — NILM models cannot load")
            return

        appliances = list(APPLIANCE_PROFILES.keys())
        loaded_count = 0

        for appliance in appliances:
            clf_path = MODELS_DIR / f"{appliance}_clf.joblib"
            reg_path = MODELS_DIR / f"{appliance}_reg.joblib"

            if clf_path.exists() and reg_path.exists():
                try:
                    clf = joblib.load(clf_path)
                    reg = joblib.load(reg_path)
                    self._models[appliance] = {"clf": clf, "reg": reg}
                    loaded_count += 1
                    logger.info(f"Loaded NILM models for: {appliance}")
                except Exception as e:
                    logger.error(f"Failed to load models for {appliance}: {e}")
            else:
                logger.warning(f"Model files not found for {appliance}: {clf_path}")

        self._loaded = True
        logger.info(f"NILM Disaggregator ready: {loaded_count}/{len(appliances)} models loaded")

    def disaggregate(self, aggregate_window: np.ndarray) -> list[dict[str, Any]]:
        """
        Run NILM inference on an aggregate power window.
        Returns per-appliance breakdown with ON/OFF + estimated watts.
        """
        if not self._loaded:
            self.load_models()

        # Extract features from the aggregate window
        feat_dict = extract_features(aggregate_window)
        if feat_dict is None:
            return self._fallback_results()

        # Build feature vector in correct column order
        feat_vector = np.array([[feat_dict.get(c, 0.0) for c in self._feature_columns]])

        results = []
        for appliance, models in self._models.items():
            profile = APPLIANCE_PROFILES.get(appliance, {})
            try:
                # Classifier: ON (1) or OFF (0)
                is_on = bool(models["clf"].predict(feat_vector)[0])
                # Regressor: estimated watts
                est_watts = float(models["reg"].predict(feat_vector)[0])
                est_watts = max(0, est_watts)  # Clamp negatives

                # Confidence from classifier probability
                try:
                    proba = models["clf"].predict_proba(feat_vector)[0]
                    confidence = float(max(proba))
                except Exception:
                    confidence = 0.75

                results.append({
                    "appliance": appliance,
                    "label": profile.get("label", appliance),
                    "category": profile.get("category", "other"),
                    "is_on": is_on,
                    "estimated_watts": round(est_watts, 1) if is_on else 0,
                    "confidence": round(confidence, 3),
                    "source": "nilm",
                })
            except Exception as e:
                logger.error(f"NILM inference failed for {appliance}: {e}")
                results.append({
                    "appliance": appliance,
                    "label": profile.get("label", appliance),
                    "category": profile.get("category", "other"),
                    "is_on": False,
                    "estimated_watts": 0,
                    "confidence": 0,
                    "source": "nilm",
                })

        return results

    def _fallback_results(self) -> list[dict[str, Any]]:
        """Return OFF results when feature extraction fails."""
        results = []
        for appliance, profile in APPLIANCE_PROFILES.items():
            results.append({
                "appliance": appliance,
                "label": profile.get("label", appliance),
                "category": profile.get("category", "other"),
                "is_on": False,
                "estimated_watts": 0,
                "confidence": 0,
                "source": "nilm",
            })
        return results

    @property
    def model_info(self) -> dict:
        """Return metadata about loaded models."""
        meta_path = MODELS_DIR / "model_metadata.json"
        version = "unknown"
        if meta_path.exists():
            try:
                with open(meta_path, "r") as f:
                    version = json.load(f).get("version", "unknown")
            except Exception:
                pass
        return {
            "models_loaded": len(self._models),
            "model_version": version,
            "appliances": list(self._models.keys()),
            "feature_count": len(self._feature_columns),
            "models_dir": str(MODELS_DIR),
        }


# ── Smart Plug Reader (Demo) ──────────────────────────────────────

class SmartPlugReader:
    """
    Reads power data from smart plugs.
    Currently returns synthetic data for demo.
    Later: integrates with Tuya adapter in backend/app/adapters/device.py
    """

    def __init__(self):
        # In production, this would come from Supabase (appliances table has_smart_plug flag)
        self._smart_plug_appliances: dict[str, dict] = {}

    def register_smart_plug(self, appliance_key: str, device_id: str = ""):
        """Register an appliance as having a smart plug."""
        self._smart_plug_appliances[appliance_key] = {
            "device_id": device_id,
            "registered_at": datetime.now().isoformat(),
        }

    def has_smart_plug(self, appliance_key: str) -> bool:
        return appliance_key in self._smart_plug_appliances

    def read_power(self, appliance_key: str) -> dict[str, Any] | None:
        """
        Read exact power from smart plug.
        Demo: returns synthetic exact reading.
        Production: call Tuya API via adapter.
        """
        if appliance_key not in self._smart_plug_appliances:
            return None

        profile = APPLIANCE_PROFILES.get(appliance_key)
        if not profile:
            return None

        import os
        hour = int(os.getenv("SIMULATED_HOUR", "20"))
        start_h, end_h = profile["active_hours"]
        duty = profile["duty_cycle"]

        if start_h <= hour < end_h and random.random() < duty:
            low, high = profile["on_range"]
            watts = round(random.uniform(low, high), 1)
            return {
                "appliance": appliance_key,
                "label": profile["label"],
                "category": profile["category"],
                "is_on": True,
                "estimated_watts": watts,
                "confidence": 1.0,  # Exact measurement
                "source": "smart_plug",
            }
        else:
            return {
                "appliance": appliance_key,
                "label": profile["label"],
                "category": profile["category"],
                "is_on": False,
                "estimated_watts": 0,
                "confidence": 1.0,
                "source": "smart_plug",
            }


# ── Power Analytics Service (Background Pre-computation) ───────────

class PowerAnalyticsService:
    """
    Main orchestrator: merges smart plug readings + NILM estimates.

    ARCHITECTURE:
      A background thread runs NILM inference + data generation every 60 seconds.
      API calls just return the last pre-computed result — instant response (~0ms).
      This keeps NILM running on real XGBoost models without any API lag.
    """

    COMPUTE_INTERVAL = 10  # seconds between background computations

    def __init__(self):
        from app.config import get_settings
        self.settings = get_settings()
        
        self.nilm = NilmDisaggregator()
        self.smart_plug = SmartPlugReader()
        
        if self.settings.replay_mode_enabled:
            self.telemetry_source = ReplayTelemetrySource(self.settings)
        else:
            raise NotImplementedError("Live telemetry streaming source not implemented.")

        # Pre-computed results (written by background thread, read by API)
        self._snapshot: dict[str, Any] = {}
        self._breakdown: dict[str, Any] = {}
        self._timeline: list[dict[str, Any]] = []
        self._sources: dict[str, Any] = {}
        self._ready = False
        self._last_home_id = "demo"
        self._supabase = None
        self._consecutive_failures = 0
        self._is_stale = False
        self._stale_since: str | None = None
        self._last_valid_timestamp: str | None = None

        # Background thread
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        # For demo: register AC as having a smart plug
        self.smart_plug.register_smart_plug("ac", device_id="tuya_demo_ac_001")

    def initialize(self):
        """Load NILM models and start background computation thread."""
        try:
            self.telemetry_source.initialize()
        except Exception as e:
            logger.error("[STARTUP] Failed to initialize telemetry source: %s", e)
            
        self.nilm.load_models()

        # Build Supabase client for appliance status lookup
        self._supabase = None
        try:
            if create_client and self.settings.supabase_url and self.settings.supabase_service_role_key:
                self._supabase = create_client(self.settings.supabase_url, self.settings.supabase_service_role_key)
                logger.info("NILM: Supabase client initialized")
        except Exception as e:
            logger.warning("NILM: Supabase not available (%s) — using synthetic profiles", e)
        # Compute initial data
        self._compute_all()
        self._ready = True

        # Start background thread
        self._thread = threading.Thread(target=self._background_loop, daemon=True)
        self._thread.start()
        logger.info("PowerAnalyticsService initialized — background compute running every %ds", self.COMPUTE_INTERVAL)

    def _background_loop(self):
        """Runs in a daemon thread — recomputes all data every COMPUTE_INTERVAL."""
        while not self._stop_event.is_set():
            self._stop_event.wait(self.COMPUTE_INTERVAL)
            if self._stop_event.is_set():
                break
            try:
                # Use last known home_id (stored when snapshot is requested)
                self._compute_all(self._last_home_id)
                logger.debug("Background NILM compute completed")
            except Exception as e:
                logger.error("Background compute error: %s", e)

    def _get_on_appliances(self, home_id: str) -> list[dict]:
        """Fetch full appliance rows that are currently ON from Supabase.
        Returns list of {name, category, rated_power_w}.
        Falls back to synthetic demo profiles if Supabase unavailable or home_id='demo'.
        """
        if not self._supabase or not home_id or home_id == 'demo':
            # Demo mode: return all profiles as synthetic appliances
            return [
                {"name": p["label"], "category": p["category"], "rated_power_w": p["rated_watts"]}
                for p in APPLIANCE_PROFILES.values()
            ]
        try:
            resp = self._supabase.table("appliances") \
                .select("name,category,rated_power_w,status") \
                .eq("home_id", home_id) \
                .eq("is_active", True) \
                .eq("status", "ON") \
                .execute()
            rows = resp.data or []
            if not rows:
                return []  # Nothing ON — just Standby & Others
            return rows
        except Exception as e:
            logger.warning("NILM: Supabase query failed: %s", e)
            return [
                {"name": p["label"], "category": p["category"], "rated_power_w": p["rated_watts"]}
                for p in APPLIANCE_PROFILES.values()
            ]

    def _compute_all(self, home_id: str = "demo"):
        """Run all heavy computation — called by background thread.
        
        ON/OFF ground truth = Supabase appliance status.
        Watt values = synthetic (profile on_range + slight randomness).
        NILM XGBoost = used for watt estimation only.
        """
        self._last_home_id = home_id

        # 1. Fetch from TelemetrySource and validate (never fabricate values)
        try:
            aggregate_window = self.telemetry_source.get_current_window()
            if not validate_window(aggregate_window, self.settings.window_size, self.settings.max_valid_power_w):
                raise MalformedTelemetryError("Telemetry window failed contract validation")
            self._consecutive_failures = 0
            if self._is_stale:
                logger.info("[RECOVERY] Telemetry source recovered. Ingestion running normally.")
            self._is_stale = False
            self._stale_since = None
            self._last_valid_timestamp = datetime.now().isoformat()
        except Exception as e:
            self._consecutive_failures += 1
            if not self._is_stale:
                self._stale_since = datetime.now().isoformat()
            self._is_stale = True
            logger.warning("[DEGRADATION] Telemetry ingest failed (consecutive failures: %d): %s", self._consecutive_failures, e)
            
            if self._snapshot:
                # Update status of existing snapshot to stale (DEGRADED state)
                self._snapshot["is_stale"] = True
                self._snapshot["diagnostics"]["consecutive_failures"] = self._consecutive_failures
                self._snapshot["diagnostics"]["source_health"]["status"] = "DEGRADED"
                self._snapshot["diagnostics"]["stale_since"] = self._stale_since
                return
            else:
                logger.error("[FAILURE] Telemetry failure and no valid snapshot exists to serve stale data (FAILED state).")
                return  # Return cleanly to keep worker loop alive.

        # 2. Run real NILM inference using the loaded XGBoost models
        appliance_data = self.nilm.disaggregate(aggregate_window)

        aggregate_watts = round(float(np.mean(aggregate_window)), 1)
        predicted_total = round(sum(a["estimated_watts"] for a in appliance_data), 1)
        untracked_watts = round(max(0.0, aggregate_watts - predicted_total), 1)

        # 3. Standby & Others (always present)
        appliance_data.append({
            "appliance": "standby_others",
            "label": "Standby & Others",
            "category": "other",
            "is_on": True,
            "estimated_watts": untracked_watts,
            "confidence": 0.6,
            "source": "estimated",
        })

        self._snapshot = {
            "timestamp": datetime.now().isoformat(),
            "aggregate_watts": aggregate_watts,
            "appliances": appliance_data,
            "total_disaggregated": predicted_total,
            "untracked_watts": untracked_watts,
            "smart_plug_count": sum(1 for a in appliance_data if a["source"] == "smart_plug"),
            "nilm_count": sum(1 for a in appliance_data if a["source"] == "nilm"),
            "mode": "simulation",
            "is_stale": self._is_stale,
            "diagnostics": {
                "source_health": self.telemetry_source.get_health_status(),
                "consecutive_failures": self._consecutive_failures,
                "stale_since": self._stale_since,
                "last_valid_timestamp": self._last_valid_timestamp
            }
        }

        # 2. Breakdown (donut chart data)
        total = aggregate_watts if aggregate_watts > 0 else 1
        breakdown = []
        for a in appliance_data:
            pct = round((a["estimated_watts"] / total) * 100, 1)
            breakdown.append({
                "appliance": a["appliance"],
                "label": a["label"],
                "category": a["category"],
                "watts": a["estimated_watts"],
                "percentage": pct,
                "is_on": a["is_on"],
                "source": a["source"],
                "confidence": a["confidence"],
            })
        breakdown.sort(key=lambda x: x["watts"], reverse=True)

        self._breakdown = {
            "total_watts": aggregate_watts,
            "breakdown": breakdown,
            "timestamp": self._snapshot["timestamp"],
        }

        # 3. Timeline (24h)
        self._timeline = []
        now = datetime.now()
        for i in range(24):
            ts = now - timedelta(hours=24 - i)
            hour = ts.hour
            mult = 1.4 if (8 <= hour < 12 or 18 <= hour < 22) else (0.5 if 0 <= hour < 6 else 1.0)
            self._timeline.append({
                "timestamp": ts.isoformat(),
                "time_label": f"{hour:02d}:00",
                "watts": round(aggregate_watts * mult, 1)
            })

        # 4. Sources
        sources = []
        for key, profile in APPLIANCE_PROFILES.items():
            has_plug = self.smart_plug.has_smart_plug(key)
            sources.append({
                "appliance": key,
                "label": profile["label"],
                "category": profile["category"],
                "source": "smart_plug" if has_plug else "nilm",
                "accuracy": "exact (±1W)" if has_plug else "estimated (±15-30W)",
            })
        self._sources = {
            "sources": sources,
            "model_info": self.nilm.model_info,
        }

    # ── Public API (instant — just return pre-computed data) ──────

    def get_live_snapshot(self, home_id: str) -> dict[str, Any]:
        """Return pre-computed snapshot — instant. Also stores home_id for background recompute."""
        self._last_home_id = home_id  # ensure background uses correct home
        if not self._snapshot:
            raise TelemetryUnavailableError("No historical snapshot available. Ingest pipeline failed on startup.")
        return self._snapshot

    def get_power_timeline(self, home_id: str, hours: int = 24) -> list[dict[str, Any]]:
        """Return pre-computed timeline — instant."""
        if not self._timeline:
            return []
        return self._timeline

    def get_appliance_breakdown(self, home_id: str) -> dict[str, Any]:
        """Derive breakdown live from current snapshot (always in sync with ON appliances)."""
        self._last_home_id = home_id
        snapshot = self._snapshot
        if not snapshot:
            raise TelemetryUnavailableError("No historical breakdown available. Ingest pipeline failed on startup.")
        appliances = snapshot.get("appliances", [])
        total = snapshot.get("aggregate_watts", 1) or 1
        breakdown = []
        for a in appliances:
            pct = round((a["estimated_watts"] / total) * 100, 1)
            breakdown.append({
                "appliance": a["appliance"],
                "label": a["label"],
                "category": a["category"],
                "watts": a["estimated_watts"],
                "percentage": pct,
                "is_on": a.get("is_on", True),
                "source": a["source"],
                "confidence": a.get("confidence", 0.8),
            })
        breakdown.sort(key=lambda x: x["watts"], reverse=True)
        return {
            "total_watts": snapshot.get("aggregate_watts", 0),
            "breakdown": breakdown,
            "timestamp": snapshot.get("timestamp", ""),
        }

    def get_sources(self, home_id: str) -> dict[str, Any]:
        """Return source info — instant."""
        return self._sources


# ── Singleton ──────────────────────────────────────────────────────

_service: PowerAnalyticsService | None = None


def get_power_analytics_service() -> PowerAnalyticsService:
    """Get or create the singleton PowerAnalyticsService."""
    global _service
    if _service is None:
        _service = PowerAnalyticsService()
        _service.initialize()
    return _service

