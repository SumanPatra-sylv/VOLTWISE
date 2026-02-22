#!/usr/bin/env python3
"""
preprocess_and_features.py

Loads aggregate and appliance CSVs from data/raw/iawe/, resamples to 5 seconds,
aligns timestamps, creates 5-minute windows with features, and saves to CSV.

Usage:
    python scripts/preprocess_and_features.py

Output:
    data/processed/features.csv  - Feature matrix (one row per window)
    data/processed/labels.csv    - Labels (ON/OFF and watts per appliance)
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

# ============================================================================
# CONFIGURATION - EDIT THESE IF NEEDED
# ============================================================================

# Project root directory (relative to script location)
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Input directory containing CSVs
RAW_DATA_DIR = PROJECT_DIR / "data" / "raw" / "iawe"

# Output directory for processed data
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"

# Aggregate file - set to None for auto-detection, or specify filename
# Auto-detection looks for files containing: "agg", "mains", "aggregate"
AGG_FILE = None  # e.g., "mains.csv" or None for auto-detect

# Appliances to detect (must match part of CSV filename)
APPLIANCES = ["ac", "fridge", "washing_machine", "television"]

# ON/OFF thresholds in watts (appliance is ON if power > threshold)
ON_THRESHOLDS = {
    "ac": 50.0,           # Air conditioner: relatively high idle
    "fridge": 30.0,       # Refrigerator: compressor cycles
    "washing_machine": 50.0,  # Washing machine
    "television": 20.0,   # Television
}

# Resampling and windowing parameters
RESAMPLE_PERIOD = "5s"      # Resample all data to 5-second intervals
WINDOW_SIZE = 60            # 60 samples = 5 minutes at 5s resolution
WINDOW_STEP = 30            # 50% overlap (step = 30 samples)

# Column name mappings (adjust based on your CSV format)
# The script will try these column names in order
TIMESTAMP_COLUMNS = ["timestamp", "time", "datetime", "date", "index", "Timestamp", "Time"]
POWER_COLUMNS = ["W", "power", "watts", "watt", "active_power", "P", "power_w", "Power", "Watts"]


# ============================================================================
# CSV LOADING FUNCTIONS
# ============================================================================

def find_column(df, candidates):
    """Find the first matching column name from a list of candidates."""
    for col in candidates:
        if col in df.columns:
            return col
        # Try case-insensitive match
        for df_col in df.columns:
            if df_col.lower() == col.lower():
                return df_col
    return None


def load_csv(filepath, name="data"):
    """
    Load a CSV file and return a pandas Series with datetime index.
    
    Handles various CSV formats:
    - With or without header
    - Various timestamp column names
    - Various power column names
    - Unix timestamps or datetime strings
    """
    print(f"  Loading {name}: {filepath.name}")
    
    # Try reading with header first
    try:
        df = pd.read_csv(filepath, low_memory=False)
    except Exception as e:
        print(f"    [WARN] Error reading {filepath.name}: {e}")
        return None
    
    if df.empty:
        print(f"    [WARN] Empty file: {filepath.name}")
        return None
    
    # Debug: show columns
    print(f"    Columns: {list(df.columns)}")
    print(f"    Shape: {df.shape}")
    
    # Handle case where first column is unnamed (index column)
    if "Unnamed: 0" in df.columns:
        df = df.rename(columns={"Unnamed: 0": "timestamp"})
    
    # Find timestamp column
    ts_col = find_column(df, TIMESTAMP_COLUMNS)
    
    # If no timestamp column, try using the index or first column
    if ts_col is None:
        if df.index.dtype == 'int64' and len(df.columns) >= 1:
            # Assume first column might be timestamp
            ts_col = df.columns[0]
            print(f"    Using first column as timestamp: {ts_col}")
        else:
            print(f"    [WARN] No timestamp column found in {filepath.name}")
            print(f"    Available columns: {list(df.columns)}")
            return None
    
    # Find power column
    power_col = find_column(df, POWER_COLUMNS)
    
    # If no power column found, use the last numeric column
    if power_col is None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # Exclude timestamp-like columns
        numeric_cols = [c for c in numeric_cols if c != ts_col]
        if numeric_cols:
            power_col = numeric_cols[-1]  # Use last numeric column
            print(f"    Using column '{power_col}' as power")
        else:
            print(f"    [WARN] No power column found in {filepath.name}")
            return None
    
    # Convert power column to numeric (handle mixed types)
    df[power_col] = pd.to_numeric(df[power_col], errors='coerce')
    
    # Parse timestamp - check if it looks like Unix timestamp (large integers)
    ts_values = pd.to_numeric(df[ts_col], errors='coerce')
    if ts_values.notna().any() and ts_values.iloc[0] > 1e9:
        # Unix timestamp in seconds
        timestamps = pd.to_datetime(ts_values, unit='s')
        print(f"    Parsed as Unix timestamp (seconds)")
    else:
        try:
            # Try parsing as datetime string
            timestamps = pd.to_datetime(df[ts_col])
        except:
            try:
                # Try parsing as Unix timestamp (milliseconds)
                timestamps = pd.to_datetime(df[ts_col], unit='ms')
            except Exception as e:
                print(f"    [WARN] Cannot parse timestamps in {filepath.name}: {e}")
                return None
    
    # Create series
    series = pd.Series(df[power_col].values, index=timestamps, name=name)
    series = series.sort_index()
    
    # Remove duplicates
    series = series[~series.index.duplicated(keep='first')]
    
    # Drop NaN values
    series = series.dropna()
    
    # Basic stats
    print(f"    Time range: {series.index.min()} to {series.index.max()}")
    print(f"    Power range: {series.min():.2f} to {series.max():.2f} watts")
    print(f"    Samples: {len(series)}")
    
    return series


def find_aggregate_file(data_dir):
    """Auto-detect the aggregate power file."""
    patterns = ["agg", "mains", "aggregate", "total", "main"]
    
    csv_files = list(data_dir.glob("*.csv"))
    
    for pattern in patterns:
        for f in csv_files:
            if pattern in f.name.lower():
                return f
    
    return None


def find_appliance_file(data_dir, appliance):
    """Find CSV file for a specific appliance."""
    csv_files = list(data_dir.glob("*.csv"))
    
    for f in csv_files:
        if appliance.lower() in f.name.lower():
            return f
    
    return None


# ============================================================================
# FEATURE EXTRACTION
# ============================================================================

def extract_features(window):
    """
    Extract statistical features from a window of power readings.
    
    Args:
        window: numpy array of power values (60 samples)
    
    Returns:
        dict of features
    """
    features = {}
    
    # Handle empty or all-NaN windows
    if len(window) == 0 or np.all(np.isnan(window)):
        return None
    
    # Remove NaNs for statistics
    clean = window[~np.isnan(window)]
    if len(clean) < 10:  # Need at least some valid samples
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
    
    # Differences (changes between consecutive samples)
    if len(clean) > 1:
        diffs = np.diff(clean)
        features["diff_mean"] = np.mean(np.abs(diffs))
        features["diff_max"] = np.max(np.abs(diffs))
        features["diff_std"] = np.std(diffs)
    else:
        features["diff_mean"] = 0
        features["diff_max"] = 0
        features["diff_std"] = 0
    
    # Zero crossings of difference (approximate frequency of changes)
    if len(clean) > 2:
        diffs = np.diff(clean)
        zero_crossings = np.sum(np.diff(np.sign(diffs)) != 0)
        features["zero_crossings"] = zero_crossings
    else:
        features["zero_crossings"] = 0
    
    # Root mean square
    features["rms"] = np.sqrt(np.mean(clean ** 2))
    
    return features


# ============================================================================
# MAIN PROCESSING
# ============================================================================

def main():
    print("=" * 60)
    print("NILM Preprocessing & Feature Extraction")
    print("=" * 60)
    print("")
    
    # ========================================================================
    # Check directories
    # ========================================================================
    
    if not RAW_DATA_DIR.exists():
        print(f"[ERROR] Data directory not found: {RAW_DATA_DIR}")
        print("")
        print("Please create the directory and add your CSV files:")
        print(f"  mkdir -p {RAW_DATA_DIR}")
        print("")
        return 1
    
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    
    # List available files
    csv_files = list(RAW_DATA_DIR.glob("*.csv"))
    print(f"Found {len(csv_files)} CSV files in {RAW_DATA_DIR}:")
    for f in csv_files:
        print(f"  - {f.name}")
    print("")
    
    if len(csv_files) == 0:
        print("[ERROR] No CSV files found!")
        print(f"Please place your iAWE CSV files in: {RAW_DATA_DIR}")
        return 1
    
    # ========================================================================
    # Load aggregate power
    # ========================================================================
    
    print("-" * 40)
    print("Loading Aggregate Power")
    print("-" * 40)
    
    if AGG_FILE:
        agg_path = RAW_DATA_DIR / AGG_FILE
    else:
        agg_path = find_aggregate_file(RAW_DATA_DIR)
    
    if agg_path is None or not agg_path.exists():
        print("[ERROR] Aggregate file not found!")
        print("")
        print("Auto-detection looks for filenames containing: agg, mains, aggregate")
        print("")
        print("Available files:")
        for f in csv_files:
            print(f"  - {f.name}")
        print("")
        print("Please set AGG_FILE at the top of this script, e.g.:")
        print('  AGG_FILE = "your_mains_file.csv"')
        return 1
    
    agg_series = load_csv(agg_path, name="aggregate")
    if agg_series is None:
        print("[ERROR] Failed to load aggregate file")
        return 1
    
    # ========================================================================
    # Load appliance data
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Loading Appliance Data")
    print("-" * 40)
    
    appliance_series = {}
    
    for appliance in APPLIANCES:
        app_path = find_appliance_file(RAW_DATA_DIR, appliance)
        
        if app_path is None:
            print(f"[ERROR] Appliance file not found: {appliance}")
            print("")
            print("Available files:")
            for f in csv_files:
                print(f"  - {f.name}")
            print("")
            print(f"Please ensure a CSV with '{appliance}' in the filename exists,")
            print(f"or remove '{appliance}' from the APPLIANCES list at the top of this script.")
            return 1
        
        series = load_csv(app_path, name=appliance)
        if series is None:
            print(f"[ERROR] Failed to load appliance file: {appliance}")
            return 1
        
        appliance_series[appliance] = series
    
    # ========================================================================
    # Align and Resample to common frequency
    # ========================================================================
    
    print("")
    print("-" * 40)
    print(f"Resampling and Aligning to {RESAMPLE_PERIOD}")
    print("-" * 40)
    
    # Find common time range (only based on aggregate - main constraint)
    common_start = agg_series.index.min()
    common_end = agg_series.index.max()
    
    # Create a common time index based on aggregate
    common_index = pd.date_range(start=common_start, end=common_end, freq=RESAMPLE_PERIOD)
    print(f"  Common time range: {common_start} to {common_end}")
    print(f"  Common index size: {len(common_index)}")
    
    # Resample aggregate
    agg_resampled = agg_series.resample(RESAMPLE_PERIOD).mean()
    agg_resampled = agg_resampled.reindex(common_index)
    agg_resampled = agg_resampled.ffill().bfill()  # Fill small gaps
    print(f"  Aggregate: {len(agg_series)} -> {len(agg_resampled)} samples")
    
    # Resample and align appliances
    app_resampled = {}
    for app, series in appliance_series.items():
        # Resample to 5s
        resampled = series.resample(RESAMPLE_PERIOD).mean()
        # Reindex to common index
        resampled = resampled.reindex(common_index)
        # Fill NaN with 0 (appliance off when no reading)
        resampled = resampled.fillna(0)
        app_resampled[app] = resampled
        print(f"  {app}: {len(series)} -> {len(resampled)} samples")
    
    # ========================================================================
    # Create aligned dataframe
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Creating Aligned DataFrame")
    print("-" * 40)
    
    df_aligned = pd.DataFrame(index=common_index)
    df_aligned["aggregate"] = agg_resampled
    
    for app, series in app_resampled.items():
        df_aligned[app] = series
    
    # Drop rows where aggregate is NaN (critical)
    rows_before = len(df_aligned)
    df_aligned = df_aligned.dropna(subset=["aggregate"])
    rows_after = len(df_aligned)
    
    print(f"  Aligned samples: {rows_after} (dropped {rows_before - rows_after} due to NaN)")
    
    if rows_after == 0:
        print("[ERROR] No samples after alignment!")
        return 1
    
    print(f"  Duration: {(df_aligned.index[-1] - df_aligned.index[0]).total_seconds() / 3600:.1f} hours")
    
    # ========================================================================
    # Create windows and extract features
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Extracting Features")
    print("-" * 40)
    print(f"  Window size: {WINDOW_SIZE} samples ({WINDOW_SIZE * 5} seconds)")
    print(f"  Step size: {WINDOW_STEP} samples ({WINDOW_STEP * 5} seconds)")
    
    features_list = []
    labels_list = []
    
    n_samples = len(df_aligned)
    n_windows = 0
    
    for start_idx in range(0, n_samples - WINDOW_SIZE + 1, WINDOW_STEP):
        end_idx = start_idx + WINDOW_SIZE
        
        # Extract window
        window = df_aligned.iloc[start_idx:end_idx]
        
        # Extract features from aggregate
        agg_window = window["aggregate"].values
        features = extract_features(agg_window)
        
        if features is None:
            continue
        
        # Add window metadata
        features["window_start"] = str(window.index[0])
        features["window_end"] = str(window.index[-1])
        
        # Extract labels for each appliance
        labels = {"window_start": str(window.index[0])}
        
        for app in APPLIANCES:
            app_window = window[app].values
            app_mean = np.nanmean(app_window)
            app_max = np.nanmax(app_window)
            
            # ON/OFF label (based on mean power in window)
            threshold = ON_THRESHOLDS.get(app, 50.0)
            labels[f"{app}_on"] = 1 if app_mean > threshold else 0
            
            # Watts label (mean power in window)
            labels[f"{app}_watts"] = app_mean
            
            # Additional: max power in window
            labels[f"{app}_watts_max"] = app_max
        
        features_list.append(features)
        labels_list.append(labels)
        n_windows += 1
    
    print(f"  Created {n_windows} windows")
    
    # ========================================================================
    # Save to CSV
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Saving Results")
    print("-" * 40)
    
    # Create DataFrames
    df_features = pd.DataFrame(features_list)
    df_labels = pd.DataFrame(labels_list)
    
    # Save
    features_path = PROCESSED_DIR / "features.csv"
    labels_path = PROCESSED_DIR / "labels.csv"
    
    df_features.to_csv(features_path, index=False)
    df_labels.to_csv(labels_path, index=False)
    
    print(f"  Features saved: {features_path}")
    print(f"    Shape: {df_features.shape}")
    print(f"  Labels saved: {labels_path}")
    print(f"    Shape: {df_labels.shape}")
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    print("")
    print("=" * 60)
    print("Preprocessing Complete!")
    print("=" * 60)
    print("")
    print("Label statistics:")
    for app in APPLIANCES:
        on_count = df_labels[f"{app}_on"].sum()
        total = len(df_labels)
        on_pct = 100 * on_count / total
        mean_watts = df_labels[f"{app}_watts"].mean()
        print(f"  {app}: {on_count}/{total} ON ({on_pct:.1f}%), mean power: {mean_watts:.1f}W")
    
    print("")
    print("Next step: python scripts/train_edge_models.py")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
