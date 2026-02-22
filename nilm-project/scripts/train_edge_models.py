#!/usr/bin/env python3
"""
train_edge_models.py

Trains one XGBoost classifier (ON/OFF) and one XGBoost regressor (watts) per appliance.
Models are saved to models/edge/ for later inference.

Usage:
    python scripts/train_edge_models.py

Output:
    models/edge/<appliance>_clf.joblib  - Binary classifier
    models/edge/<appliance>_reg.joblib  - Watt regressor
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_absolute_error, mean_squared_error, r2_score
)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Project root directory (relative to script location)
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Input: processed features and labels
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
FEATURES_FILE = PROCESSED_DIR / "features.csv"
LABELS_FILE = PROCESSED_DIR / "labels.csv"

# Output: trained models
MODELS_DIR = PROJECT_DIR / "models" / "edge"

# Appliances to train (must match labels in labels.csv)
APPLIANCES = ["ac", "fridge", "washing_machine", "television"]

# Train/test split ratio
TEST_SIZE = 0.2
RANDOM_STATE = 42

# XGBoost parameters (conservative defaults for edge deployment)
XGB_PARAMS_CLF = {
    "n_estimators": 100,
    "max_depth": 5,
    "learning_rate": 0.1,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_STATE,
    "use_label_encoder": False,
    "eval_metric": "logloss",
}

XGB_PARAMS_REG = {
    "n_estimators": 100,
    "max_depth": 5,
    "learning_rate": 0.1,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_STATE,
}


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print("NILM Edge Model Training")
    print("=" * 60)
    print("")
    
    # Check for XGBoost
    try:
        import xgboost as xgb
        print(f"[INFO] XGBoost version: {xgb.__version__}")
    except ImportError:
        print("[ERROR] XGBoost not installed!")
        print("Install with: pip install xgboost")
        return 1
    
    # ========================================================================
    # Load data
    # ========================================================================
    
    print("")
    print("-" * 40)
    print("Loading Data")
    print("-" * 40)
    
    if not FEATURES_FILE.exists():
        print(f"[ERROR] Features file not found: {FEATURES_FILE}")
        print("Run preprocessing first: python scripts/preprocess_and_features.py")
        return 1
    
    if not LABELS_FILE.exists():
        print(f"[ERROR] Labels file not found: {LABELS_FILE}")
        print("Run preprocessing first: python scripts/preprocess_and_features.py")
        return 1
    
    df_features = pd.read_csv(FEATURES_FILE)
    df_labels = pd.read_csv(LABELS_FILE)
    
    print(f"  Features: {df_features.shape}")
    print(f"  Labels: {df_labels.shape}")
    
    # Extract feature columns (exclude metadata columns)
    feature_cols = [c for c in df_features.columns if c not in ["window_start", "window_end"]]
    X = df_features[feature_cols].values
    
    print(f"  Feature columns: {len(feature_cols)}")
    
    # Handle any NaN values in features
    if np.any(np.isnan(X)):
        print("  [WARN] NaN values in features, replacing with 0")
        X = np.nan_to_num(X, nan=0.0)
    
    # ========================================================================
    # Create output directory
    # ========================================================================
    
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  Output directory: {MODELS_DIR}")
    
    # ========================================================================
    # Train models for each appliance
    # ========================================================================
    
    results = {}
    
    for appliance in APPLIANCES:
        print("")
        print("=" * 60)
        print(f"Training models for: {appliance.upper()}")
        print("=" * 60)
        
        # Check if labels exist for this appliance
        on_col = f"{appliance}_on"
        watts_col = f"{appliance}_watts"
        
        if on_col not in df_labels.columns:
            print(f"  [ERROR] Label column not found: {on_col}")
            print(f"  Available columns: {list(df_labels.columns)}")
            continue
        
        # Extract labels
        y_clf = df_labels[on_col].values
        y_reg = df_labels[watts_col].values
        
        # Check class balance
        on_count = np.sum(y_clf == 1)
        off_count = np.sum(y_clf == 0)
        print(f"  Class balance: ON={on_count}, OFF={off_count}")
        
        if on_count == 0 or off_count == 0:
            print(f"  [WARN] Only one class present, skipping classifier training")
            continue
        
        # Split data
        X_train, X_test, y_clf_train, y_clf_test, y_reg_train, y_reg_test = train_test_split(
            X, y_clf, y_reg, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y_clf
        )
        
        print(f"  Train samples: {len(X_train)}")
        print(f"  Test samples: {len(X_test)}")
        
        # --------------------------------------------------------------------
        # Train classifier
        # --------------------------------------------------------------------
        
        print("")
        print(f"  Training ON/OFF classifier...")
        
        clf = xgb.XGBClassifier(**XGB_PARAMS_CLF)
        clf.fit(X_train, y_clf_train)
        
        # Evaluate classifier
        y_clf_pred = clf.predict(X_test)
        
        acc = accuracy_score(y_clf_test, y_clf_pred)
        prec = precision_score(y_clf_test, y_clf_pred, zero_division=0)
        rec = recall_score(y_clf_test, y_clf_pred, zero_division=0)
        f1 = f1_score(y_clf_test, y_clf_pred, zero_division=0)
        
        print(f"    Accuracy:  {acc:.4f}")
        print(f"    Precision: {prec:.4f}")
        print(f"    Recall:    {rec:.4f}")
        print(f"    F1 Score:  {f1:.4f}")
        
        # Save classifier
        clf_path = MODELS_DIR / f"{appliance}_clf.joblib"
        joblib.dump(clf, clf_path)
        print(f"    Saved: {clf_path}")
        
        # --------------------------------------------------------------------
        # Train regressor
        # --------------------------------------------------------------------
        
        print("")
        print(f"  Training watt regressor...")
        
        reg = xgb.XGBRegressor(**XGB_PARAMS_REG)
        reg.fit(X_train, y_reg_train)
        
        # Evaluate regressor
        y_reg_pred = reg.predict(X_test)
        
        mae = mean_absolute_error(y_reg_test, y_reg_pred)
        rmse = np.sqrt(mean_squared_error(y_reg_test, y_reg_pred))
        r2 = r2_score(y_reg_test, y_reg_pred)
        
        print(f"    MAE:  {mae:.2f} W")
        print(f"    RMSE: {rmse:.2f} W")
        print(f"    R2:   {r2:.4f}")
        
        # Save regressor
        reg_path = MODELS_DIR / f"{appliance}_reg.joblib"
        joblib.dump(reg, reg_path)
        print(f"    Saved: {reg_path}")
        
        # Store results
        results[appliance] = {
            "clf": {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1},
            "reg": {"mae": mae, "rmse": rmse, "r2": r2}
        }
    
    # ========================================================================
    # Save feature column names (needed for inference)
    # ========================================================================
    
    feature_cols_path = MODELS_DIR / "feature_columns.joblib"
    joblib.dump(feature_cols, feature_cols_path)
    print(f"\n  Feature columns saved: {feature_cols_path}")
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    print("")
    print("=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print("")
    print("Summary:")
    print("-" * 40)
    
    for appliance, metrics in results.items():
        print(f"\n{appliance.upper()}:")
        print(f"  Classifier F1:    {metrics['clf']['f1']:.4f}")
        print(f"  Regressor MAE:    {metrics['reg']['mae']:.2f} W")
    
    print("")
    print(f"Models saved to: {MODELS_DIR}")
    print("")
    print("Next steps:")
    print("  Evaluate: python scripts/evaluate_edge.py")
    print("  Inference: python scripts/inference_edge.py")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
