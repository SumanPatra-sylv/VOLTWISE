#!/usr/bin/env python3
"""
inference_edge.py

Streaming inference simulator. Reads aggregate CSV (same loader as preprocess script),
resamples to 5s, slides a 5-minute window with 50% overlap (STEP=30), extracts simple features,
runs saved XGBoost classifiers/regressors, prints ON/OFF + estimated watts.

This simulates real-time edge deployment where new readings arrive continuously.

Usage:
    python scripts/inference_edge.py

    # Or specify a custom aggregate file:
    python scripts/inference_edge.py --file path/to/aggregate.csv

    # Limit number of windows to process:
    python scripts/inference_edge.py --max-windows 20
"""

import os
import sys
import time
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from scipy import stats

# ============================================================================
# CONFIGURATION
# ============================================================================

# Project root directory (relative to script location)
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Input: raw aggregate data (for simulation)
RAW_DATA_DIR = PROJECT_DIR / "data" / "raw" / "iawe"

# Models directory
MODELS_DIR = PROJECT_DIR / "models" / "edge"

# Appliances to detect
APPLIANCES = ["ac", "fridge", "washing_machine", "television"]

# Window parameters (must match training)
RESAMPLE_PERIOD = "5s"
WINDOW_SIZE = 60    # 60 samples = 5 minutes
WINDOW_STEP = 30    # 50% overlap

# Simulation speed (seconds between outputs, 0 for no delay)
SIMULATION_DELAY = 0.5

# Column name mappings
TIMESTAMP_COLUMNS = ["timestamp", "time", "datetime", "date", "index", "Timestamp", "Time"]
POWER_COLUMNS = ["W", "power", "watts", "watt", "active_power", "P", "power_w", "Power", "Watts"]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def find_column(df, candidates):
    """Find the first matching column name from a list of candidates."""
    for col in candidates:
        if col in df.columns:
            return col
        for df_col in df.columns:
            if df_col.lower() == col.lower():
                return df_col
    return None


def find_aggregate_file(data_dir):
    """Auto-detect the aggregate power file."""
    patterns = ["agg", "mains", "aggregate", "total", "main"]
    csv_files = list(data_dir.glob("*.csv"))
    
    for pattern in patterns:
        for f in csv_files:
            if pattern in f.name.lower():
                return f
    return None


def load_aggregate_csv(filepath):
    """Load aggregate CSV and return pandas Series with datetime index."""
    print(f"[INFO] Loading aggregate data: {filepath}")
    
    df = pd.read_csv(filepath, low_memory=False)
    
    if "Unnamed: 0" in df.columns:
        df = df.rename(columns={"Unnamed: 0": "timestamp"})
    
    # Find timestamp column
    ts_col = find_column(df, TIMESTAMP_COLUMNS)
    if ts_col is None:
        ts_col = df.columns[0]
    
    # Find power column
    power_col = find_column(df, POWER_COLUMNS)
    if power_col is None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        numeric_cols = [c for c in numeric_cols if c != ts_col]
        if numeric_cols:
            power_col = numeric_cols[-1]
        else:
            raise ValueError("No power column found")
    
    # Convert power column to numeric (handle mixed types)
    df[power_col] = pd.to_numeric(df[power_col], errors='coerce')
    
    # Parse timestamps - check if Unix timestamp
    ts_values = pd.to_numeric(df[ts_col], errors='coerce')
    if ts_values.notna().any() and ts_values.iloc[0] > 1e9:
        # Unix timestamp in seconds
        timestamps = pd.to_datetime(ts_values, unit='s')
        print(f"  Parsed as Unix timestamp (seconds)")
    else:
        try:
            timestamps = pd.to_datetime(df[ts_col])
        except:
            try:
                timestamps = pd.to_datetime(df[ts_col], unit='ms')
            except:
                raise ValueError("Cannot parse timestamps")
    
    series = pd.Series(df[power_col].values, index=timestamps, name="aggregate")
    series = series.sort_index()
    series = series[~series.index.duplicated(keep='first')]
    series = series.dropna()
    
    print(f"  Time range: {series.index.min()} to {series.index.max()}")
    print(f"  Samples: {len(series)}")
    
    return series


def extract_features(window):
    """Extract statistical features from a window of power readings."""
    features = {}
    
    if len(window) == 0 or np.all(np.isnan(window)):
        return None
    
    clean = window[~np.isnan(window)]
    if len(clean) < 10:
        return None
    
    # Basic statistics
    features["mean"] = np.mean(clean)
    features["std"] = np.std(clean)
    features["min"] = np.min(clean)
    features["max"] = np.max(clean)
    features["median"] = np.median(clean)
    
    # Percentiles
    features["p10"] = np.percentile(clean, 10)
    features["p25"] = np.percentile(clean, 25)
    features["p75"] = np.percentile(clean, 75)
    features["p90"] = np.percentile(clean, 90)
    
    # Range and IQR
    features["range"] = features["max"] - features["min"]
    features["iqr"] = features["p75"] - features["p25"]
    
    # Shape statistics
    features["skew"] = stats.skew(clean) if len(clean) > 2 else 0
    features["kurtosis"] = stats.kurtosis(clean) if len(clean) > 3 else 0
    
    # Variability
    features["coef_var"] = features["std"] / features["mean"] if features["mean"] > 0 else 0
    
    # Differences
    if len(clean) > 1:
        diffs = np.diff(clean)
        features["diff_mean"] = np.mean(np.abs(diffs))
        features["diff_max"] = np.max(np.abs(diffs))
        features["diff_std"] = np.std(diffs)
    else:
        features["diff_mean"] = 0
        features["diff_max"] = 0
        features["diff_std"] = 0
    
    # Zero crossings
    if len(clean) > 2:
        diffs = np.diff(clean)
        features["zero_crossings"] = np.sum(np.diff(np.sign(diffs)) != 0)
    else:
        features["zero_crossings"] = 0
    
    # RMS
    features["rms"] = np.sqrt(np.mean(clean ** 2))
    
    return features


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="NILM Streaming Inference Simulator")
    parser.add_argument("--file", type=str, help="Path to aggregate CSV file")
    parser.add_argument("--max-windows", type=int, default=0, help="Max windows to process (0=all)")
    parser.add_argument("--no-delay", action="store_true", help="Disable simulation delay")
    args = parser.parse_args()
    
    print("=" * 70)
    print("NILM Streaming Inference Simulator")
    print("=" * 70)
    print("")
    
    # ========================================================================
    # Load models
    # ========================================================================
    
    print("-" * 40)
    print("Loading Models")
    print("-" * 40)
    
    # Load feature columns
    feature_cols_path = MODELS_DIR / "feature_columns.joblib"
    if not feature_cols_path.exists():
        print(f"[ERROR] Feature columns not found: {feature_cols_path}")
        print("Run training first: python scripts/train_edge_models.py")
        return 1
    
    feature_cols = joblib.load(feature_cols_path)
    print(f"  Feature columns: {len(feature_cols)}")
    
    # Load classifiers and regressors
    # Use improved models where available:
    # - Oversampled classifier for TV (better F1)
    # - ON-only trained regressors (better MAE)
    classifiers = {}
    regressors = {}
    
    for appliance in APPLIANCES:
        # Check for oversampled classifier (TV fix)
        clf_oversampled_path = MODELS_DIR / f"{appliance}_clf_oversampled.joblib"
        clf_path = MODELS_DIR / f"{appliance}_clf.joblib"
        
        # Check for ON-only regressor (improved)
        reg_ononly_path = MODELS_DIR / f"{appliance}_reg_ononly.joblib"
        reg_path = MODELS_DIR / f"{appliance}_reg.joblib"
        
        # Load classifier (prefer oversampled if exists)
        if clf_oversampled_path.exists():
            classifiers[appliance] = joblib.load(clf_oversampled_path)
            print(f"  Loaded: {appliance} classifier (oversampled)")
        elif clf_path.exists():
            classifiers[appliance] = joblib.load(clf_path)
            print(f"  Loaded: {appliance} classifier")
        else:
            print(f"  [WARN] Classifier not found: {appliance}")
            continue
        
        # Load regressor (prefer ON-only if exists)
        if reg_ononly_path.exists():
            regressors[appliance] = joblib.load(reg_ononly_path)
            print(f"  Loaded: {appliance} regressor (ON-only)")
        elif reg_path.exists():
            regressors[appliance] = joblib.load(reg_path)
            print(f"  Loaded: {appliance} regressor")
        else:
            print(f"  [WARN] Regressor not found: {appliance}")
            del classifiers[appliance]
            continue
    
    if len(classifiers) == 0:
        print("[ERROR] No models loaded!")
        return 1
    
    # ========================================================================
    # Load aggregate data
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Loading Aggregate Data")
    print("-" * 40)
    
    if args.file:
        agg_path = Path(args.file)
    else:
        agg_path = find_aggregate_file(RAW_DATA_DIR)
    
    if agg_path is None or not agg_path.exists():
        print(f"[ERROR] Aggregate file not found!")
        print("Use --file to specify the aggregate CSV path")
        return 1
    
    agg_series = load_aggregate_csv(agg_path)
    
    # Resample
    print(f"  Resampling to {RESAMPLE_PERIOD}...")
    agg_resampled = agg_series.resample(RESAMPLE_PERIOD).mean()
    agg_resampled = agg_resampled.dropna()
    print(f"  Resampled samples: {len(agg_resampled)}")
    
    # ========================================================================
    # Streaming inference simulation
    # ========================================================================
    
    print("")
    print("=" * 70)
    print("Starting Streaming Inference")
    print("=" * 70)
    print("")
    print(f"Window: {WINDOW_SIZE} samples ({WINDOW_SIZE * 5}s)")
    print(f"Step: {WINDOW_STEP} samples ({WINDOW_STEP * 5}s)")
    print(f"Appliances: {', '.join(classifiers.keys())}")
    print("")
    print("-" * 70)
    
    # Header
    header = f"{'Window Time':<25}"
    for app in classifiers.keys():
        header += f" | {app.upper():<12}"
    print(header)
    print("-" * 70)
    
    n_samples = len(agg_resampled)
    window_count = 0
    max_windows = args.max_windows if args.max_windows > 0 else float('inf')
    
    for start_idx in range(0, n_samples - WINDOW_SIZE + 1, WINDOW_STEP):
        if window_count >= max_windows:
            break
        
        end_idx = start_idx + WINDOW_SIZE
        
        # Extract window
        window_data = agg_resampled.iloc[start_idx:end_idx]
        window_values = window_data.values
        
        # Extract features
        features = extract_features(window_values)
        if features is None:
            continue
        
        # Create feature vector in correct order
        X = np.array([[features.get(col, 0) for col in feature_cols]])
        X = np.nan_to_num(X, nan=0.0)
        
        # Get window timestamp
        window_time = window_data.index[0].strftime("%Y-%m-%d %H:%M:%S")
        
        # Run inference for each appliance
        results = {}
        for appliance in classifiers.keys():
            clf = classifiers[appliance]
            reg = regressors[appliance]
            
            # Predict ON/OFF
            on_off = clf.predict(X)[0]
            
            # Predict watts
            watts = max(0, reg.predict(X)[0])
            
            # If OFF, set watts to 0
            if on_off == 0:
                watts = 0.0
            
            results[appliance] = {"on": on_off, "watts": watts}
        
        # Format output
        output = f"{window_time:<25}"
        for app in classifiers.keys():
            status = "ON " if results[app]["on"] else "OFF"
            watts = results[app]["watts"]
            output += f" | {status} {watts:>6.1f}W  "
        
        print(output)
        
        window_count += 1
        
        # Simulation delay
        if not args.no_delay and SIMULATION_DELAY > 0:
            time.sleep(SIMULATION_DELAY)
    
    print("-" * 70)
    print(f"\nProcessed {window_count} windows")
    print("")
    print("=" * 70)
    print("Inference Complete")
    print("=" * 70)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
