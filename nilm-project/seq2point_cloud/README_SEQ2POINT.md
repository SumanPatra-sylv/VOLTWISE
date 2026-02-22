# Seq2Point Training (iAWE) — Quick Start for a Friend

This README explains, step-by-step, how to set up the environment and train Seq2Point models from the iAWE dataset on a local machine (RTX 3050) or use Google Colab (GPU). It also explains what files are in this repository and how to run them.

## Contents
- `scripts/train_seq2point_iAWE_local.py`  — single-appliance trainer (local GPU)
- `scripts/train_all_seq2point_local.py`  — loop trainer (multiple appliances)
- `scripts/requirements_seq2point.txt`    — pip packages for training
- `models/cloud/`                         — (output) trained Seq2Point models & params
- `data/raw/iawe/`                        — put your extracted iAWE CSVs here

## Overview

Seq2Point is a Conv1D model that takes a window of aggregate power (e.g., 599 samples ≈ 50 minutes @5s) and predicts the appliance power at the center time of that window. It's useful for improving watt estimates when XGBoost regressors on summary features are insufficient.

## What you need (local)
- A GPU (RTX 3050 recommended) with CUDA drivers installed
- Conda environment (recommended)
- iAWE dataset CSVs in `~/nilm-project/data/raw/iawe/`
  - Ensure filenames contain keywords (e.g., "aggregate" or "mains" for mains, and `fridge`, `ac`, `geyser`, `television` for appliances)

## Set up environment (local)

1. Create project folder and clone this repo (or copy files)
   ```bash
   mkdir -p ~/nilm-project
   cd ~/nilm-project
   # copy files into this folder or clone your repo
   ```

2. Create conda env and install packages
   ```bash
   conda create -n nilm python=3.8 -y
   conda activate nilm
   pip install -r seq2point_cloud/scripts/requirements_seq2point.txt
   ```

3. Verify GPU visible to TensorFlow
   ```bash
   python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
   ```
   You should see at least one GPU listed.

## How to run (single appliance)

Example: train on `fridge`
```bash
conda activate nilm
python seq2point_cloud/scripts/train_seq2point_iAWE_local.py --appliance fridge
```

The script will:
- Auto-find aggregate and appliance CSVs in `data/raw/iawe/` by keyword
- Resample to 5s, align, normalize, create windows
- Train the Seq2Point model and save:
  - `models/cloud/seq2point_{appliance}_best.h5`
  - `models/cloud/seq2point_{appliance}_params.json` (normalization params)

## How to run (multiple appliances)

Example:
```bash
python seq2point_cloud/scripts/train_all_seq2point_local.py --appliances fridge ac television
```

This runs the single-appliance trainer sequentially for each appliance (one GPU, one model at a time).

## Recommended training settings (RTX 3050)

| Parameter | Value | Notes |
|-----------|-------|-------|
| WINDOW | 599 | Default, ~50 min at 5s |
| BATCH_SIZE | 128 | Reduce to 64 or 32 if OOM |
| EPOCHS | 40 | Uses EarlyStopping (patience=6) |
| Mixed precision | Enabled | Speeds training, reduces VRAM |

If you see CUDA OOM, lower BATCH_SIZE.

## Quick tips

- **Start small**: test with a small fraction of windows to ensure the pipeline works:
  - Edit `train_seq2point_iAWE_local.py` and temporarily set `train_end = int(N_windows * 0.2)` to use 20% of windows.
- Save checkpoints frequently (the script does this).
- If training many appliances, prefer running sequentially or use a dedicated GPU instance.

## Colab option (if you don't have a good GPU locally)

1. Upload your iAWE CSVs to Google Drive under `MyDrive/nilm-data/iawe/`
2. Open a Colab notebook, mount Drive, and run the training cells
3. The same training code can be adapted to Colab (use the provided script as reference)
4. Save models to Drive

## What to share back with me / other team members

After training, share:
- The trained model file `models/cloud/seq2point_{appliance}.h5`
- The params JSON `models/cloud/seq2point_{appliance}_params.json`

The edge API can call a cloud Flask endpoint to use these models as a fallback.

## Restore / Inference tip

For inference you need:
- The model `.h5`
- The normalization params `.json`

```python
import json
import numpy as np
import tensorflow as tf

# Load model and params
model = tf.keras.models.load_model("models/cloud/seq2point_fridge.h5")
with open("models/cloud/seq2point_fridge_params.json") as f:
    params = json.load(f)

# Normalize input aggregate window
agg_window_norm = (agg_window - params["agg_mean"]) / params["agg_std"]

# Predict
pred_norm = model.predict(agg_window_norm.reshape(1, -1, 1))

# Denormalize to watts
pred_watts = pred_norm[0, 0] * params["app_std"] + params["app_mean"]
```

## Contact / Notes

- If you run into OOM or GPU issues, reduce BATCH_SIZE or WINDOW, or use Colab.
- If your CSV layout is different (headers, extra columns), update the loader in `scripts/train_seq2point_iAWE_local.py` (function `load_csv_timeseries`) to match your CSV format.

Good luck! If you (or your friend) want, I can:
- Produce a Colab notebook ready to run
- Create a simple Flask cloud inference server for the saved Seq2Point models
- Add a small demo to show edge → cloud fallback for ambiguous windows
