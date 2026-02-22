#!/usr/bin/env python3
"""
train_seq2point.py (optional)

Trains Seq2Point models for improved watt estimation. This script is heavy and
strongly recommended to run on a GPU (Google Colab or cloud GPU).

Seq2Point is a neural network approach where:
- Input: A window of aggregate power readings (sequence)
- Output: Power consumption of a single appliance at the center point

This typically provides better disaggregation than XGBoost for complex patterns.

Usage:
    python scripts/train_seq2point.py

    # Specify appliance:
    python scripts/train_seq2point.py --appliance fridge

    # Use CPU (slow):
    python scripts/train_seq2point.py --cpu

Requirements:
    - TensorFlow 2.x (pip install tensorflow)
    - GPU recommended (CUDA-enabled)

Output:
    models/seq2point/<appliance>_seq2point.h5
"""

import os
import sys
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import warnings

warnings.filterwarnings('ignore')

# ============================================================================
# CONFIGURATION
# ============================================================================

# Project root directory (relative to script location)
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Input: processed data
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
RAW_DATA_DIR = PROJECT_DIR / "data" / "raw" / "iawe"

# Output: Seq2Point models
SEQ2POINT_DIR = PROJECT_DIR / "models" / "seq2point"

# Appliances
APPLIANCES = ["ac", "fridge", "geyser"]

# Seq2Point parameters
WINDOW_SIZE = 599           # Typical Seq2Point window (odd number for center point)
BATCH_SIZE = 64
EPOCHS = 50
LEARNING_RATE = 0.001
VALIDATION_SPLIT = 0.2

# Column name mappings
TIMESTAMP_COLUMNS = ["timestamp", "time", "datetime", "date", "index", "Timestamp", "Time"]
POWER_COLUMNS = ["W", "power", "watts", "watt", "active_power", "P", "power_w", "Power", "Watts"]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def check_tensorflow():
    """Check if TensorFlow is available and report GPU status."""
    try:
        import tensorflow as tf
        print(f"[INFO] TensorFlow version: {tf.__version__}")
        
        # Check GPU
        gpus = tf.config.list_physical_devices('GPU')
        if gpus:
            print(f"[INFO] GPUs available: {len(gpus)}")
            for gpu in gpus:
                print(f"       - {gpu.name}")
            return True, True  # TF available, GPU available
        else:
            print("[WARN] No GPU detected. Training will be slow on CPU.")
            return True, False  # TF available, no GPU
            
    except ImportError:
        print("[ERROR] TensorFlow not installed!")
        print("")
        print("Install with:")
        print("  pip install tensorflow")
        print("")
        print("For GPU support (NVIDIA):")
        print("  pip install tensorflow[and-cuda]")
        return False, False


def find_column(df, candidates):
    """Find the first matching column name from a list of candidates."""
    for col in candidates:
        if col in df.columns:
            return col
        for df_col in df.columns:
            if df_col.lower() == col.lower():
                return df_col
    return None


def find_file(data_dir, pattern):
    """Find CSV file matching pattern."""
    csv_files = list(data_dir.glob("*.csv"))
    for f in csv_files:
        if pattern.lower() in f.name.lower():
            return f
    return None


def load_csv(filepath):
    """Load CSV file and return pandas Series with datetime index."""
    df = pd.read_csv(filepath)
    
    if "Unnamed: 0" in df.columns:
        df = df.rename(columns={"Unnamed: 0": "timestamp"})
    
    ts_col = find_column(df, TIMESTAMP_COLUMNS)
    if ts_col is None:
        ts_col = df.columns[0]
    
    power_col = find_column(df, POWER_COLUMNS)
    if power_col is None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        numeric_cols = [c for c in numeric_cols if c != ts_col]
        power_col = numeric_cols[-1] if numeric_cols else None
    
    if power_col is None:
        raise ValueError(f"No power column found in {filepath}")
    
    try:
        timestamps = pd.to_datetime(df[ts_col])
    except:
        try:
            timestamps = pd.to_datetime(df[ts_col], unit='s')
        except:
            timestamps = pd.to_datetime(df[ts_col], unit='ms')
    
    series = pd.Series(df[power_col].values, index=timestamps)
    series = series.sort_index()
    series = series[~series.index.duplicated(keep='first')]
    
    return series


def create_seq2point_dataset(agg_series, app_series, window_size):
    """
    Create Seq2Point training data.
    
    X: windows of aggregate power (window_size,)
    y: appliance power at center point (scalar)
    """
    # Align series
    common_idx = agg_series.index.intersection(app_series.index)
    agg = agg_series.loc[common_idx].values
    app = app_series.loc[common_idx].values
    
    # Calculate offset (center point)
    offset = window_size // 2
    
    # Create windows
    n_samples = len(agg) - window_size + 1
    X = np.zeros((n_samples, window_size))
    y = np.zeros(n_samples)
    
    for i in range(n_samples):
        X[i] = agg[i:i+window_size]
        y[i] = app[i + offset]  # Center point
    
    return X, y


def build_seq2point_model(window_size):
    """Build Seq2Point CNN model."""
    import tensorflow as tf
    from tensorflow.keras import layers, Model
    
    inputs = layers.Input(shape=(window_size, 1))
    
    # Convolutional layers
    x = layers.Conv1D(30, 10, activation='relu', padding='same')(inputs)
    x = layers.Conv1D(30, 8, activation='relu', padding='same')(x)
    x = layers.Conv1D(40, 6, activation='relu', padding='same')(x)
    x = layers.Conv1D(50, 5, activation='relu', padding='same')(x)
    x = layers.Conv1D(50, 5, activation='relu', padding='same')(x)
    
    # Flatten and dense
    x = layers.Flatten()(x)
    x = layers.Dense(1024, activation='relu')(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(1, activation='linear')(x)
    
    model = Model(inputs=inputs, outputs=outputs)
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss='mse',
        metrics=['mae']
    )
    
    return model


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Train Seq2Point models for NILM")
    parser.add_argument("--appliance", type=str, default=None,
                        help="Train for specific appliance (default: all)")
    parser.add_argument("--cpu", action="store_true",
                        help="Force CPU training (slow)")
    parser.add_argument("--epochs", type=int, default=EPOCHS,
                        help=f"Number of epochs (default: {EPOCHS})")
    args = parser.parse_args()
    
    print("=" * 60)
    print("Seq2Point Model Training")
    print("=" * 60)
    print("")
    
    # Check TensorFlow
    tf_available, gpu_available = check_tensorflow()
    
    if not tf_available:
        return 1
    
    if not gpu_available and not args.cpu:
        print("")
        print("[WARN] No GPU detected. Training will be very slow!")
        print("       Consider using Google Colab with GPU runtime.")
        print("       Or use --cpu flag to force CPU training.")
        print("")
        response = input("Continue with CPU training? (y/n): ")
        if response.lower() != 'y':
            return 0
    
    import tensorflow as tf
    
    # Force CPU if requested
    if args.cpu:
        tf.config.set_visible_devices([], 'GPU')
        print("[INFO] Forcing CPU training")
    
    # ========================================================================
    # Load data
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Loading Data")
    print("-" * 40)
    
    # Find aggregate file
    agg_path = find_file(RAW_DATA_DIR, "mains") or find_file(RAW_DATA_DIR, "agg")
    if agg_path is None:
        print("[ERROR] Aggregate file not found!")
        return 1
    
    print(f"  Aggregate: {agg_path.name}")
    agg_series = load_csv(agg_path)
    
    # Resample to consistent frequency
    agg_series = agg_series.resample('5S').mean().dropna()
    print(f"  Samples: {len(agg_series)}")
    
    # Create output directory
    SEQ2POINT_DIR.mkdir(parents=True, exist_ok=True)
    
    # ========================================================================
    # Train for each appliance
    # ========================================================================
    
    appliances_to_train = [args.appliance] if args.appliance else APPLIANCES
    
    for appliance in appliances_to_train:
        print("")
        print("=" * 60)
        print(f"Training Seq2Point for: {appliance.upper()}")
        print("=" * 60)
        
        # Find appliance file
        app_path = find_file(RAW_DATA_DIR, appliance)
        if app_path is None:
            print(f"[WARN] Appliance file not found: {appliance}")
            continue
        
        print(f"  Loading: {app_path.name}")
        app_series = load_csv(app_path)
        app_series = app_series.resample('5S').mean().dropna()
        
        # Create dataset
        print(f"  Creating dataset (window={WINDOW_SIZE})...")
        X, y = create_seq2point_dataset(agg_series, app_series, WINDOW_SIZE)
        
        print(f"  Samples: {len(X)}")
        print(f"  X shape: {X.shape}")
        print(f"  y range: {y.min():.1f} to {y.max():.1f} W")
        
        # Normalize
        agg_mean = np.mean(X)
        agg_std = np.std(X) + 1e-8
        X_norm = (X - agg_mean) / agg_std
        
        # Reshape for Conv1D: (samples, timesteps, features)
        X_norm = X_norm.reshape(-1, WINDOW_SIZE, 1)
        
        # Split
        n_train = int(len(X_norm) * (1 - VALIDATION_SPLIT))
        X_train, X_val = X_norm[:n_train], X_norm[n_train:]
        y_train, y_val = y[:n_train], y[n_train:]
        
        print(f"  Train: {len(X_train)}, Val: {len(X_val)}")
        
        # Build model
        print("")
        print("  Building model...")
        model = build_seq2point_model(WINDOW_SIZE)
        model.summary()
        
        # Callbacks
        callbacks = [
            tf.keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=5,
                restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=3
            )
        ]
        
        # Train
        print("")
        print(f"  Training for {args.epochs} epochs...")
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=args.epochs,
            batch_size=BATCH_SIZE,
            callbacks=callbacks,
            verbose=1
        )
        
        # Evaluate
        print("")
        print("  Evaluation:")
        y_pred = model.predict(X_val, verbose=0).flatten()
        mae = np.mean(np.abs(y_val - y_pred))
        rmse = np.sqrt(np.mean((y_val - y_pred) ** 2))
        print(f"    MAE:  {mae:.2f} W")
        print(f"    RMSE: {rmse:.2f} W")
        
        # Save model
        model_path = SEQ2POINT_DIR / f"{appliance}_seq2point.h5"
        model.save(model_path)
        print(f"  Saved: {model_path}")
        
        # Save normalization params
        norm_path = SEQ2POINT_DIR / f"{appliance}_norm.npz"
        np.savez(norm_path, mean=agg_mean, std=agg_std)
        print(f"  Saved: {norm_path}")
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    print("")
    print("=" * 60)
    print("Seq2Point Training Complete!")
    print("=" * 60)
    print("")
    print(f"Models saved to: {SEQ2POINT_DIR}")
    print("")
    print("To use Seq2Point models in inference, load with:")
    print("  import tensorflow as tf")
    print("  model = tf.keras.models.load_model('models/seq2point/<app>_seq2point.h5')")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
