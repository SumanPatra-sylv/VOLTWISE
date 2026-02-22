# NILM Version A — ON/OFF + Estimated Watts (iAWE-ready)

## Overview

This repository provides an end-to-end pipeline to train a simple NILM system that outputs:
- **Appliance ON/OFF detection** (binary classification)
- **Estimated power consumption** (watts regression)

It is designed to work with the **iAWE (India Academic Dataset for Water and Electricity)** dataset, but can be adapted for REDD or UK-DALE with minor modifications.

---

## Repository Structure

```
nilm-project/
├─ data/
│   ├─ raw/iawe/          # Put your downloaded CSVs here
│   ├─ h5/                # Optional converted HDF5
│   └─ processed/         # features.csv, labels.csv
├─ models/
│   └─ edge/              # Saved XGBoost models
├─ scripts/
│   ├─ 00_create_env.sh
│   ├─ 01_extract_and_list.sh
│   ├─ convert_to_h5.py
│   ├─ preprocess_and_features.py
│   ├─ train_edge_models.py
│   ├─ evaluate_edge.py
│   ├─ inference_edge.py
│   └─ train_seq2point.py
├─ requirements.txt
└─ README.md
```

---

## Quick Start

### 1. Create directories

```bash
mkdir -p ~/nilm-project/data/raw/iawe
mkdir -p ~/nilm-project/data/h5
mkdir -p ~/nilm-project/data/processed
mkdir -p ~/nilm-project/models/edge
```

On Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\nilm-project\data\raw\iawe"
New-Item -ItemType Directory -Force -Path "$HOME\nilm-project\data\h5"
New-Item -ItemType Directory -Force -Path "$HOME\nilm-project\data\processed"
New-Item -ItemType Directory -Force -Path "$HOME\nilm-project\models\edge"
```

### 2. Download the iAWE Dataset

1. Visit: https://iawe.github.io/ or the official source
2. Download the electricity CSV files
3. Place all CSV files into `data/raw/iawe/`

Expected files (example naming):
- `mains.csv` or `aggregate.csv` — aggregate power readings
- `ac.csv` — air conditioner
- `fridge.csv` — refrigerator
- `geyser.csv` — water heater

### 3. Set up environment

**Option A: Using Conda (recommended)**
```bash
bash scripts/00_create_env.sh
conda activate nilm
```

**Option B: Using pip directly**
```bash
pip install -r requirements.txt
```

### 4. Run the pipeline

```bash
# Step 1: Preprocess data and extract features
python scripts/preprocess_and_features.py

# Step 2: Train XGBoost models
python scripts/train_edge_models.py

# Step 3: Evaluate models
python scripts/evaluate_edge.py

# Step 4: Run streaming inference simulator
python scripts/inference_edge.py
```

---

## Configuration

### Appliance Settings

Edit the top of `scripts/preprocess_and_features.py` to configure:

```python
# Appliances to detect (keys must match part of CSV filename)
APPLIANCES = ["ac", "fridge", "geyser"]

# ON/OFF thresholds in watts (appliance is ON if power > threshold)
ON_THRESHOLDS = {
    "ac": 50.0,
    "fridge": 30.0,
    "geyser": 100.0,
}
```

### File Detection

The scripts auto-detect files by name:
- **Aggregate**: filename contains "agg", "mains", or "aggregate"
- **Appliances**: filename contains the appliance name (e.g., "ac", "fridge")

If auto-detection fails, manually set `AGG_FILE` at the top of the preprocess script.

---

## Output Files

After running the pipeline:

| File | Description |
|------|-------------|
| `data/processed/features.csv` | Extracted features (60 samples × statistical features) |
| `data/processed/labels.csv` | ON/OFF labels and watt values per appliance |
| `models/edge/<appliance>_clf.joblib` | XGBoost classifier for ON/OFF |
| `models/edge/<appliance>_reg.joblib` | XGBoost regressor for watts |

---

## Notes & Tips

1. **CSV Format**: The preprocess script expects CSV files with columns like `timestamp` (or index) and `power`/`watts`. If your CSVs have different column names, edit the `load_csv()` function in `preprocess_and_features.py`.

2. **Memory**: For large datasets, processing may require 8+ GB RAM. The scripts process data in chunks where possible.

3. **GPU Training**: For better watt estimation, use `scripts/train_seq2point.py` on a GPU (Google Colab recommended).

4. **Disk Space**: Keep at least 20 GB free while processing large datasets.

5. **Window Settings**: Default is 5-minute windows (60 samples at 5s resolution) with 50% overlap.

---

## Troubleshooting

### "No aggregate file found"
- Ensure your aggregate power CSV is in `data/raw/iawe/`
- The filename must contain "agg", "mains", or "aggregate"
- Or manually set `AGG_FILE` in the preprocess script

### "Appliance file not found: ac"
- Check that a CSV with "ac" in the filename exists
- The script will list all available files to help you

### "Timestamps don't align"
- Ensure all CSVs cover overlapping time periods
- Check timestamp format consistency

---

## Advanced: Seq2Point Training

For improved watt estimation using deep learning:

```bash
# Requires GPU and TensorFlow
python scripts/train_seq2point.py
```

This script is optional and heavy. Google Colab with GPU runtime is recommended.

---

## License

This project is provided as-is for educational and research purposes.

## Acknowledgments

- iAWE Dataset: Indian Academic Dataset for Water and Electricity
- NILMTK: Non-Intrusive Load Monitoring Toolkit
- XGBoost: Gradient Boosting Framework
