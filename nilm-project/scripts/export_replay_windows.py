#!/usr/bin/env python3
"""
export_replay_windows.py

Validates, resamples, and slices raw held-out mains aggregate data into 
60-sample replay windows. Outputs a binary numpy array and a metadata companion.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
import numpy as np
import pandas as pd

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data" / "electricity"
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"

SPLIT_DATE = "2013-07-19"
OVERLAP_END = "2013-08-04"
WINDOW_SIZE = 60
STEP_SIZE = 30

def load_and_clean_mains(file_name: str) -> pd.Series:
    filepath = DATA_DIR / file_name
    print(f"Loading {file_name}...")
    df = pd.read_csv(filepath, low_memory=False)
    
    # Clean and parse timestamps
    df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"])
    df["datetime"] = pd.to_datetime(df["timestamp"], unit="s")
    df = df.set_index("datetime")
    
    series = pd.to_numeric(df["W"], errors="coerce").dropna()
    series = series[~series.index.duplicated(keep="first")].sort_index()
    return series

def main():
    if not (DATA_DIR / "1.csv").exists() or not (DATA_DIR / "2.csv").exists():
        print("[ERROR] Mains CSVs not found in data/electricity/")
        return 1
        
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load and sum mains channels
    m1 = load_and_clean_mains("1.csv")
    m2 = load_and_clean_mains("2.csv")
    agg = m1.add(m2, fill_value=0.0)
    
    # Resample to 5s & interpolate small gaps
    print("Resampling and interpolating to 5-second cadence...")
    agg = agg.resample("5s").mean().interpolate(limit=6)
    
    # Enforce held-out period strictly
    agg = agg[(agg.index >= SPLIT_DATE) & (agg.index <= OVERLAP_END)]
    print(f"Held-out period samples: {len(agg)}")
    
    # Slice windows
    windows = []
    values = agg.values
    for i in range(0, len(values) - WINDOW_SIZE + 1, STEP_SIZE):
        w = values[i:i + WINDOW_SIZE]
        if len(w) == WINDOW_SIZE and not np.any(np.isnan(w)):
            windows.append(w)
            
    windows = np.array(windows, dtype=np.float32)
    
    # Save output files
    out_npy = PROCESSED_DIR / "replay_windows.npy"
    out_json = PROCESSED_DIR / "replay_metadata.json"
    
    np.save(out_npy, windows)
    
    metadata = {
        "dataset_source": "iAWE mains1 + mains2 summed",
        "window_size": WINDOW_SIZE,
        "sampling_interval_seconds": 5,
        "split_dates": {
            "split_date": SPLIT_DATE,
            "overlap_end": OVERLAP_END
        },
        "window_count": len(windows),
        "export_timestamp": datetime.utcnow().isoformat()
    }
    
    with open(out_json, "w") as f:
        json.dump(metadata, f, indent=4)
        
    print(f"Successfully exported {len(windows)} replay windows to {out_npy}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
