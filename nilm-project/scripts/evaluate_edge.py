#!/usr/bin/env python3
"""
evaluate_edge.py

Load trained edge models and evaluate on test split. 
Outputs per-appliance classification metrics (F1, precision, recall) and regression metrics (MAE, RMSE).

Usage:
    python scripts/evaluate_edge.py

Outputs:
    Console summary of evaluation metrics
    Optional: models/edge/evaluation_report.txt
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
    confusion_matrix, classification_report,
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

# Input: trained models
MODELS_DIR = PROJECT_DIR / "models" / "edge"

# Appliances to evaluate
APPLIANCES = ["ac", "fridge", "washing_machine", "television"]

# Must match training split
TEST_SIZE = 0.2
RANDOM_STATE = 42


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print("NILM Edge Model Evaluation")
    print("=" * 60)
    print("")
    
    # ========================================================================
    # Load data
    # ========================================================================
    
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
    
    # Load feature columns
    feature_cols_path = MODELS_DIR / "feature_columns.joblib"
    if feature_cols_path.exists():
        feature_cols = joblib.load(feature_cols_path)
    else:
        feature_cols = [c for c in df_features.columns if c not in ["window_start", "window_end"]]
    
    X = df_features[feature_cols].values
    
    # Handle NaNs
    if np.any(np.isnan(X)):
        X = np.nan_to_num(X, nan=0.0)
    
    # ========================================================================
    # Evaluate each appliance
    # ========================================================================
    
    report_lines = []
    report_lines.append("=" * 60)
    report_lines.append("NILM Edge Model Evaluation Report")
    report_lines.append("=" * 60)
    report_lines.append("")
    
    all_results = {}
    
    for appliance in APPLIANCES:
        print("")
        print("=" * 60)
        print(f"Evaluating: {appliance.upper()}")
        print("=" * 60)
        
        # Check if models exist
        clf_path = MODELS_DIR / f"{appliance}_clf.joblib"
        reg_path = MODELS_DIR / f"{appliance}_reg.joblib"
        
        if not clf_path.exists():
            print(f"  [WARN] Classifier not found: {clf_path}")
            continue
        
        if not reg_path.exists():
            print(f"  [WARN] Regressor not found: {reg_path}")
            continue
        
        # Load models
        print(f"  Loading classifier: {clf_path.name}")
        clf = joblib.load(clf_path)
        
        print(f"  Loading regressor: {reg_path.name}")
        reg = joblib.load(reg_path)
        
        # Get labels
        on_col = f"{appliance}_on"
        watts_col = f"{appliance}_watts"
        
        if on_col not in df_labels.columns:
            print(f"  [ERROR] Label column not found: {on_col}")
            continue
        
        y_clf = df_labels[on_col].values
        y_reg = df_labels[watts_col].values
        
        # Split data (same split as training)
        X_train, X_test, y_clf_train, y_clf_test, y_reg_train, y_reg_test = train_test_split(
            X, y_clf, y_reg, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y_clf
        )
        
        print(f"  Test samples: {len(X_test)}")
        
        # --------------------------------------------------------------------
        # Evaluate classifier
        # --------------------------------------------------------------------
        
        print("")
        print("  Classification Results:")
        print("  " + "-" * 38)
        
        y_clf_pred = clf.predict(X_test)
        y_clf_proba = clf.predict_proba(X_test)[:, 1] if hasattr(clf, 'predict_proba') else None
        
        acc = accuracy_score(y_clf_test, y_clf_pred)
        prec = precision_score(y_clf_test, y_clf_pred, zero_division=0)
        rec = recall_score(y_clf_test, y_clf_pred, zero_division=0)
        f1 = f1_score(y_clf_test, y_clf_pred, zero_division=0)
        
        print(f"    Accuracy:  {acc:.4f}")
        print(f"    Precision: {prec:.4f}")
        print(f"    Recall:    {rec:.4f}")
        print(f"    F1 Score:  {f1:.4f}")
        
        # Confusion matrix
        cm = confusion_matrix(y_clf_test, y_clf_pred)
        print("")
        print("    Confusion Matrix:")
        print(f"                Predicted OFF  Predicted ON")
        print(f"    Actual OFF     {cm[0,0]:5d}         {cm[0,1]:5d}")
        print(f"    Actual ON      {cm[1,0]:5d}         {cm[1,1]:5d}")
        
        # --------------------------------------------------------------------
        # Evaluate regressor
        # --------------------------------------------------------------------
        
        print("")
        print("  Regression Results:")
        print("  " + "-" * 38)
        
        y_reg_pred = reg.predict(X_test)
        
        # Clip negative predictions to 0
        y_reg_pred = np.clip(y_reg_pred, 0, None)
        
        mae = mean_absolute_error(y_reg_test, y_reg_pred)
        rmse = np.sqrt(mean_squared_error(y_reg_test, y_reg_pred))
        r2 = r2_score(y_reg_test, y_reg_pred)
        
        # Also compute metrics for ON-state samples only
        on_mask = y_clf_test == 1
        if np.sum(on_mask) > 0:
            mae_on = mean_absolute_error(y_reg_test[on_mask], y_reg_pred[on_mask])
            rmse_on = np.sqrt(mean_squared_error(y_reg_test[on_mask], y_reg_pred[on_mask]))
        else:
            mae_on = rmse_on = 0
        
        print(f"    MAE (all):     {mae:.2f} W")
        print(f"    RMSE (all):    {rmse:.2f} W")
        print(f"    R2 (all):      {r2:.4f}")
        print(f"    MAE (ON only): {mae_on:.2f} W")
        print(f"    RMSE (ON only):{rmse_on:.2f} W")
        
        # Store results
        all_results[appliance] = {
            "clf": {
                "accuracy": acc,
                "precision": prec,
                "recall": rec,
                "f1": f1,
                "confusion_matrix": cm.tolist()
            },
            "reg": {
                "mae": mae,
                "rmse": rmse,
                "r2": r2,
                "mae_on": mae_on,
                "rmse_on": rmse_on
            }
        }
        
        # Add to report
        report_lines.append(f"\n{appliance.upper()}")
        report_lines.append("-" * 40)
        report_lines.append(f"Classification:")
        report_lines.append(f"  Accuracy:  {acc:.4f}")
        report_lines.append(f"  Precision: {prec:.4f}")
        report_lines.append(f"  Recall:    {rec:.4f}")
        report_lines.append(f"  F1 Score:  {f1:.4f}")
        report_lines.append(f"Regression:")
        report_lines.append(f"  MAE:       {mae:.2f} W")
        report_lines.append(f"  RMSE:      {rmse:.2f} W")
        report_lines.append(f"  R2:        {r2:.4f}")
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    print("")
    print("=" * 60)
    print("Evaluation Summary")
    print("=" * 60)
    print("")
    print(f"{'Appliance':<12} {'F1 Score':<12} {'MAE (W)':<12} {'RMSE (W)':<12}")
    print("-" * 48)
    
    for appliance, metrics in all_results.items():
        f1 = metrics["clf"]["f1"]
        mae = metrics["reg"]["mae"]
        rmse = metrics["reg"]["rmse"]
        print(f"{appliance:<12} {f1:<12.4f} {mae:<12.2f} {rmse:<12.2f}")
    
    # Save report
    report_path = MODELS_DIR / "evaluation_report.txt"
    report_lines.append("")
    report_lines.append("=" * 60)
    report_lines.append("Summary")
    report_lines.append("=" * 60)
    report_lines.append("")
    report_lines.append(f"{'Appliance':<12} {'F1 Score':<12} {'MAE (W)':<12} {'RMSE (W)':<12}")
    report_lines.append("-" * 48)
    for appliance, metrics in all_results.items():
        f1 = metrics["clf"]["f1"]
        mae = metrics["reg"]["mae"]
        rmse = metrics["reg"]["rmse"]
        report_lines.append(f"{appliance:<12} {f1:<12.4f} {mae:<12.2f} {rmse:<12.2f}")
    
    with open(report_path, 'w') as f:
        f.write('\n'.join(report_lines))
    
    print("")
    print(f"Report saved: {report_path}")
    print("")
    print("Next step: python scripts/inference_edge.py")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
