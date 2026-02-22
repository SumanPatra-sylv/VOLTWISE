#!/usr/bin/env python3
"""
convert_to_h5.py

Attempts to convert REDD dataset to HDF5 format using NILMTK.
For iAWE, the preprocess script handles CSV loading directly.

This script is OPTIONAL and only needed if you want to use NILMTK's
built-in converters for standardized HDF5 format.

Usage:
    python scripts/convert_to_h5.py

Note:
    - NILMTK installation can be tricky; if it fails, use the CSV-based
      preprocess_and_features.py script instead.
    - iAWE CSVs are processed directly in preprocess_and_features.py
"""

import os
import sys
from pathlib import Path

# ============================================================================
# CONFIGURATION
# ============================================================================

# Project root directory (relative to script location)
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Input directories
REDD_RAW_DIR = PROJECT_DIR / "data" / "raw" / "redd"
IAWE_RAW_DIR = PROJECT_DIR / "data" / "raw" / "iawe"

# Output directory for HDF5 files
H5_OUTPUT_DIR = PROJECT_DIR / "data" / "h5"


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def ensure_directories():
    """Create output directories if they don't exist."""
    H5_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] Output directory: {H5_OUTPUT_DIR}")


def check_nilmtk_available():
    """Check if NILMTK is installed and importable."""
    try:
        import nilmtk
        print(f"[INFO] NILMTK version: {nilmtk.__version__}")
        return True
    except ImportError:
        return False


def convert_redd_to_h5():
    """
    Convert REDD dataset to HDF5 using NILMTK converter.
    
    REDD structure expected:
        data/raw/redd/
        ├── house_1/
        │   ├── channel_1.dat
        │   ├── channel_2.dat
        │   └── ...
        ├── house_2/
        └── ...
    """
    from nilmtk.dataset_converters import convert_redd
    
    # Check if REDD data exists
    if not REDD_RAW_DIR.exists():
        print(f"[WARN] REDD directory not found: {REDD_RAW_DIR}")
        return False
    
    # Check for house directories
    house_dirs = list(REDD_RAW_DIR.glob("house_*"))
    if not house_dirs:
        print(f"[WARN] No house_* directories found in {REDD_RAW_DIR}")
        return False
    
    print(f"[INFO] Found {len(house_dirs)} REDD houses")
    
    # Convert
    output_file = H5_OUTPUT_DIR / "redd.h5"
    print(f"[INFO] Converting REDD to: {output_file}")
    
    try:
        convert_redd(str(REDD_RAW_DIR), str(output_file))
        print(f"[SUCCESS] REDD converted to {output_file}")
        return True
    except Exception as e:
        print(f"[ERROR] REDD conversion failed: {e}")
        return False


def convert_iawe_to_h5():
    """
    Attempt to convert iAWE dataset to HDF5.
    
    Note: NILMTK's iAWE converter may not work with all iAWE formats.
    If this fails, use preprocess_and_features.py which handles CSVs directly.
    """
    # Check if iAWE data exists
    if not IAWE_RAW_DIR.exists():
        print(f"[WARN] iAWE directory not found: {IAWE_RAW_DIR}")
        return False
    
    csv_files = list(IAWE_RAW_DIR.glob("*.csv"))
    if not csv_files:
        print(f"[WARN] No CSV files found in {IAWE_RAW_DIR}")
        return False
    
    print(f"[INFO] Found {len(csv_files)} CSV files in iAWE directory:")
    for f in csv_files:
        print(f"       - {f.name}")
    
    # Try NILMTK converter (may not work for all iAWE formats)
    try:
        from nilmtk.dataset_converters import convert_iawe
        
        output_file = H5_OUTPUT_DIR / "iawe.h5"
        print(f"[INFO] Attempting iAWE conversion to: {output_file}")
        
        convert_iawe(str(IAWE_RAW_DIR), str(output_file))
        print(f"[SUCCESS] iAWE converted to {output_file}")
        return True
        
    except ImportError:
        print("[WARN] NILMTK iAWE converter not available")
        print("[INFO] Use preprocess_and_features.py to process CSVs directly")
        return False
    except Exception as e:
        print(f"[WARN] iAWE conversion failed: {e}")
        print("[INFO] This is expected for non-standard iAWE formats")
        print("[INFO] Use preprocess_and_features.py to process CSVs directly")
        return False


def print_fallback_instructions():
    """Print instructions for CSV-based processing."""
    print("")
    print("=" * 60)
    print("FALLBACK: Direct CSV Processing")
    print("=" * 60)
    print("")
    print("If HDF5 conversion failed or NILMTK is not installed,")
    print("use the CSV-based preprocessing script instead:")
    print("")
    print("    python scripts/preprocess_and_features.py")
    print("")
    print("This script will:")
    print("  1. Load CSV files directly from data/raw/iawe/")
    print("  2. Resample to 5-second intervals")
    print("  3. Extract features and labels")
    print("  4. Save to data/processed/features.csv and labels.csv")
    print("")
    print("No NILMTK installation required!")
    print("=" * 60)


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print("NILM Dataset Converter (HDF5)")
    print("=" * 60)
    print("")
    
    # Ensure output directory exists
    ensure_directories()
    
    # Check NILMTK availability
    nilmtk_available = check_nilmtk_available()
    
    if not nilmtk_available:
        print("")
        print("[WARN] NILMTK is not installed!")
        print("")
        print("To install NILMTK (can be tricky):")
        print("  conda install -c conda-forge nilmtk")
        print("")
        print("Or install from source:")
        print("  pip install git+https://github.com/nilmtk/nilmtk.git")
        print("")
        print_fallback_instructions()
        return 1
    
    # Track conversion results
    results = {}
    
    # Try REDD conversion
    print("")
    print("-" * 40)
    print("Attempting REDD conversion...")
    print("-" * 40)
    results["redd"] = convert_redd_to_h5()
    
    # Try iAWE conversion
    print("")
    print("-" * 40)
    print("Attempting iAWE conversion...")
    print("-" * 40)
    results["iawe"] = convert_iawe_to_h5()
    
    # Summary
    print("")
    print("=" * 60)
    print("Conversion Summary")
    print("=" * 60)
    
    for dataset, success in results.items():
        status = "SUCCESS" if success else "SKIPPED/FAILED"
        print(f"  {dataset.upper()}: {status}")
    
    # Always show fallback instructions
    print_fallback_instructions()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
