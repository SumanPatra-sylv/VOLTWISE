#!/usr/bin/env python3
"""
Seq2Point trainer for iAWE (local GPU)

Usage:
  conda activate nilm
  pip install -r scripts/requirements_seq2point.txt
  python scripts/train_seq2point_iAWE_local.py --appliance fridge

What it does:
- Auto-detects aggregate and appliance CSVs in data/raw/iawe by keyword.
- Resamples to 5s, aligns series, normalizes inputs/targets.
- Creates on-the-fly Keras Sequence windows (no need to materialize all X in RAM).
- Trains a Conv1D Seq2Point model with mixed precision, ModelCheckpoint, EarlyStopping.
- Saves model and normalization params to models/cloud/.
"""
import os
import json
import math
import argparse
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks
from sklearn.model_selection import train_test_split

# -------------------- CONFIG (change if needed) --------------------
RAW_DIR = os.path.expanduser("~/nilm-project/data/raw/iawe")
SAMPLE_PERIOD = "5S"
WINDOW = 599                # typical Seq2Point window length (~50 min at 5s)
BATCH_SIZE = 128            # reduce if OOM (use 64 or 32)
EPOCHS = 40
PATIENCE = 6
MODEL_DIR = os.path.expanduser("~/nilm-project/models/cloud")
os.makedirs(MODEL_DIR, exist_ok=True)
WORKERS = 4
USE_MIXED_PRECISION = True
# ------------------------------------------------------------------

def find_file_by_keywords(folder, keywords):
    for f in os.listdir(folder):
        low = f.lower()
        for kw in keywords:
            if kw in low:
                return os.path.join(folder, f)
    return None

def load_csv_timeseries(path):
    # Try headerless (timestamp,power) else headered with date in first column.
    try:
        df = pd.read_csv(path, header=None)
        if df.shape[1] >= 2:
            ts = pd.to_datetime(df.iloc[:,0].astype(int), unit='s')
            s = pd.Series(df.iloc[:,1].astype(float).values, index=ts)
            return s.sort_index()
    except Exception:
        pass
    # fallback: try headered CSV with date index
    try:
        df2 = pd.read_csv(path, header=0, parse_dates=[0], index_col=0)
        col = df2.columns[0]
        return df2[col].astype(float).sort_index()
    except Exception as e:
        raise ValueError(f"Cannot parse CSV timeseries {path}: {e}")

class Seq2PointSequence(keras.utils.Sequence):
    def __init__(self, agg_arr, app_arr, idx_start, idx_end, window, batch_size, shuffle=True):
        self.agg = agg_arr
        self.app = app_arr
        self.start = idx_start
        self.end = idx_end
        self.window = window
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.indexes = np.arange(self.start, self.end)
        if self.shuffle:
            np.random.shuffle(self.indexes)
    def __len__(self):
        return math.ceil((self.end - self.start) / self.batch_size)
    def __getitem__(self, idx):
        batch_indexes = self.indexes[idx * self.batch_size:(idx + 1) * self.batch_size]
        X = np.zeros((len(batch_indexes), self.window, 1), dtype=np.float32)
        y = np.zeros((len(batch_indexes), 1), dtype=np.float32)
        for i, win_start in enumerate(batch_indexes):
            seq = self.agg[win_start : win_start + self.window]
            X[i, :, 0] = seq
            y[i, 0] = self.app[win_start + self.window // 2]
        return X, y
    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indexes)

def build_seq2point(input_length, mixed_precision=False):
    inp = layers.Input(shape=(input_length, 1))
    x = layers.Conv1D(30, 10, activation='relu', padding='same')(inp)
    x = layers.Conv1D(30, 8, activation='relu', padding='same')(x)
    x = layers.Conv1D(40, 6, activation='relu', padding='same')(x)
    x = layers.Flatten()(x)
    x = layers.Dense(1024, activation='relu')(x)
    out = layers.Dense(1, dtype='float32')(x)  # ensure float32 output
    model = keras.Model(inp, out)
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=1e-4), loss='mse', metrics=['mae'])
    return model

def main(appliance_name):
    # Find files
    agg_path = find_file_by_keywords(RAW_DIR, ["aggregate","mains","main","agg"])
    app_path = find_file_by_keywords(RAW_DIR, [appliance_name])
    if agg_path is None:
        raise SystemExit(f"Aggregate file not found automatically in {RAW_DIR}. Place aggregate CSV there.")
    if app_path is None:
        raise SystemExit(f"Appliance file for '{appliance_name}' not found in {RAW_DIR}. Make sure filename contains '{appliance_name}'.")

    print("Aggregate:", agg_path)
    print("Appliance:", app_path)

    print("Loading and resampling to", SAMPLE_PERIOD)
    agg = load_csv_timeseries(agg_path).resample(SAMPLE_PERIOD).mean().interpolate(limit=5)
    app = load_csv_timeseries(app_path).resample(SAMPLE_PERIOD).mean().interpolate(limit=5)

    # Align
    common_idx = agg.index.intersection(app.index)
    agg = agg.loc[common_idx]
    app = app.loc[common_idx]
    N = len(agg)
    print(f"Aligned samples: {N}")

    if N <= WINDOW:
        raise SystemExit("Not enough samples for WINDOW. Reduce WINDOW or check data.")

    # Normalize and save params
    agg_mean, agg_std = float(agg.mean()), float(agg.std() if agg.std()>0 else 1.0)
    app_mean, app_std = float(app.mean()), float(app.std() if app.std()>0 else 1.0)
    agg_norm = (agg.values - agg_mean) / agg_std
    app_norm = (app.values - app_mean) / app_std
    params = {"agg_mean": agg_mean, "agg_std": agg_std, "app_mean": app_mean, "app_std": app_std}
    with open(os.path.join(MODEL_DIR, f"seq2point_{appliance_name}_params.json"), "w") as f:
        json.dump(params, f)
    print("Saved normalization params.")

    N_windows = len(agg_norm) - WINDOW
    train_end = int(N_windows * 0.8)
    val_end = int(N_windows * 0.9)
    print("Windows:", N_windows, "Train_end:", train_end, "Val_end:", val_end)

    # prepare sequences
    train_seq = Seq2PointSequence(agg_norm, app_norm, 0, train_end, WINDOW, BATCH_SIZE, shuffle=True)
    val_seq   = Seq2PointSequence(agg_norm, app_norm, train_end, val_end, WINDOW, BATCH_SIZE, shuffle=False)
    test_seq  = Seq2PointSequence(agg_norm, app_norm, val_end, N_windows, WINDOW, BATCH_SIZE, shuffle=False)

    print("Train batches:", len(train_seq), "Val batches:", len(val_seq))

    # Mixed precision
    if USE_MIXED_PRECISION:
        try:
            from tensorflow.keras import mixed_precision
            mixed_precision.set_global_policy('mixed_float16')
            print("Mixed precision enabled.")
        except Exception as e:
            print("Could not enable mixed precision:", e)

    model = build_seq2point(WINDOW, mixed_precision=USE_MIXED_PRECISION)
    model.summary()

    ckpt_path = os.path.join(MODEL_DIR, f"seq2point_{appliance_name}_best.h5")
    cb = [
        callbacks.ModelCheckpoint(ckpt_path, monitor='val_loss', save_best_only=True, verbose=1),
        callbacks.EarlyStopping(monitor='val_loss', patience=PATIENCE, restore_best_weights=True, verbose=1),
        callbacks.ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, verbose=1)
    ]

    history = model.fit(train_seq, validation_data=val_seq, epochs=EPOCHS, callbacks=cb, workers=WORKERS, use_multiprocessing=False)

    print("Evaluating on test data...")
    test_loss, test_mae = model.evaluate(test_seq)
    print("Test MAE (normalized):", test_mae, "-> approx watts:", test_mae * app_std)

    final_model_path = os.path.join(MODEL_DIR, f"seq2point_{appliance_name}.h5")
    model.save(final_model_path)
    print("Saved model to", final_model_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--appliance", "-a", required=True, help="Appliance name to train e.g. fridge, ac, geyser, television")
    args = parser.parse_args()
    main(args.appliance)
