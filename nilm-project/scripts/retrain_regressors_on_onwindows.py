#!/usr/bin/env python3
"""
Retrain regressors using only ON windows for better MAE.
Regressors trained only on windows when appliance is ON typically perform better.
"""
import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import xgboost as xgb

DATA_DIR = "data/processed"
MODEL_DIR = "models/edge"
os.makedirs(MODEL_DIR, exist_ok=True)

feats = pd.read_csv(os.path.join(DATA_DIR, "features.csv"))
labs = pd.read_csv(os.path.join(DATA_DIR, "labels.csv"))

# Merge on index (same order)
df = pd.concat([feats, labs.drop(columns=['window_start'], errors='ignore')], axis=1)
df = df.dropna()

feature_columns = [c for c in feats.columns if c not in ['window_start', 'window_end']]
print(f"Feature columns: {len(feature_columns)}")

# Find appliances
apps = []
for col in labs.columns:
    if col.endswith("_on"):
        apps.append(col.replace("_on", ""))
print("Appliances:", apps)

summary = {}
for app in apps:
    print(f"\n{'='*50}")
    print(f"Retraining regressor for: {app.upper()}")
    print('='*50)
    
    X = df[feature_columns].values
    X = np.nan_to_num(X, nan=0.0)
    
    on_col = f"{app}_on"
    watts_col = f"{app}_watts"
    
    if on_col not in df.columns:
        print(f"  Skipping {app}: {on_col} not found")
        continue
    if watts_col not in df.columns:
        print(f"  Skipping {app}: {watts_col} not found")
        continue
    
    y_on = df[on_col].values
    y_w = df[watts_col].values

    # Select ON windows only for regressor
    idx_on = y_on == 1
    n_on = idx_on.sum()
    
    print(f"  Total windows: {len(y_on)}")
    print(f"  ON windows: {n_on}")
    
    if n_on < 50:
        print(f"  Not enough ON samples for {app} -> training regressor on ALL windows instead.")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_w, test_size=0.2, random_state=42
        )
    else:
        print(f"  Training on ON windows only ({n_on} samples)")
        X_train, X_test, y_train, y_test = train_test_split(
            X[idx_on], y_w[idx_on], test_size=0.2, random_state=42
        )

    reg = xgb.XGBRegressor(
        n_estimators=300, 
        max_depth=6, 
        learning_rate=0.05, 
        verbosity=0
    )
    reg.fit(X_train, y_train)
    y_pred = reg.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    print(f"  MAE (watts) = {mae:.2f}")

    # Save
    reg_path = os.path.join(MODEL_DIR, f"{app}_reg_ononly.joblib")
    joblib.dump(reg, reg_path)
    print(f"  Saved: {reg_path}")
    summary[app] = float(mae)

# Save summary
summary_path = os.path.join(MODEL_DIR, "reg_ononly_summary.json")
with open(summary_path, "w") as f:
    json.dump(summary, f, indent=2)

print(f"\n{'='*50}")
print("Done! New regressors saved as *_reg_ononly.joblib")
print(f"Summary saved to: {summary_path}")
print('='*50)
print("\nMAE Summary (ON-only trained):")
for app, mae in summary.items():
    print(f"  {app}: {mae:.2f} W")
