#!/usr/bin/env python3
"""
TV Fix using oversampling + retrain TV models
Loads features.csv & labels.csv, oversamples TV ON class, retrains classifier + regressor
"""
import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, mean_absolute_error, classification_report
import xgboost as xgb

DATA_DIR = "data/processed"
MODEL_DIR = "models/edge"
os.makedirs(MODEL_DIR, exist_ok=True)

feats_p = os.path.join(DATA_DIR, "features.csv")
labs_p = os.path.join(DATA_DIR, "labels.csv")

if not (os.path.isfile(feats_p) and os.path.isfile(labs_p)):
    raise SystemExit("features/labels not found in data/processed/. Run preprocess first.")

feats = pd.read_csv(feats_p)
labs = pd.read_csv(labs_p)

# Merge on index (they should have same order)
df = pd.concat([feats, labs.drop(columns=['window_start'], errors='ignore')], axis=1)
df = df.dropna()

feature_columns = [c for c in feats.columns if c not in ['window_start', 'window_end']]
print(f"Feature columns: {len(feature_columns)}")

# Find TV column heuristically
tv_on_col = None
for col in labs.columns:
    if col.endswith("_on") and ("tv" in col.lower() or "television" in col.lower()):
        tv_on_col = col
        break

if tv_on_col is None:
    cand = [c for c in labs.columns if c.endswith("_on")]
    print("Could not find a TV ON column automatically. Available ON columns:", cand)
    raise SystemExit("Please identify TV ON column name.")

print("TV on column detected:", tv_on_col)

# Find corresponding watts column
tv_watts_col = tv_on_col.replace("_on", "_watts")
if tv_watts_col not in labs.columns:
    # Try alternate naming
    possible = [c for c in labs.columns if 'television' in c.lower() and 'watts' in c.lower()]
    if possible:
        tv_watts_col = possible[0]
    else:
        print(f"Warning: watts column {tv_watts_col} not found. Available:", labs.columns.tolist())
        raise SystemExit("Cannot find TV watts column")

print("TV watts column:", tv_watts_col)

X = df[feature_columns]
y_on = df[tv_on_col]
y_w = df[tv_watts_col]

# Show original counts
orig_on = int(y_on.sum())
orig_total = len(y_on)
print(f"Original TV ON count: {orig_on} / {orig_total} windows (frac {orig_on/orig_total:.4f})")

# Separate minority and majority
df_min = df[df[tv_on_col] == 1]
df_maj = df[df[tv_on_col] == 0]
n_min = len(df_min)
n_maj = len(df_maj)

print(f"Minority (ON): {n_min}, Majority (OFF): {n_maj}")

if n_min == 0:
    raise SystemExit("No ON windows detected for TV — oversampling cannot proceed.")

# Oversample minority to match majority
df_min_upsampled = df_min.sample(n=n_maj, replace=True, random_state=42)
df_balanced = pd.concat([df_maj, df_min_upsampled], axis=0).sample(frac=1.0, random_state=42).reset_index(drop=True)
print(f"After oversampling: balanced size = {len(df_balanced)} (maj {n_maj}, upsamp min -> {len(df_min_upsampled)})")

# Split
X_bal = df_balanced[feature_columns].values
y_on_bal = df_balanced[tv_on_col].values
y_w_bal = df_balanced[tv_watts_col].values

# Handle NaNs
X_bal = np.nan_to_num(X_bal, nan=0.0)

X_train, X_test, y_on_train, y_on_test, y_w_train, y_w_test = train_test_split(
    X_bal, y_on_bal, y_w_bal, test_size=0.2, random_state=42, stratify=y_on_bal)

# Train classifier
clf = xgb.XGBClassifier(
    n_estimators=200, 
    max_depth=6, 
    learning_rate=0.1,
    use_label_encoder=False, 
    eval_metric='logloss', 
    verbosity=0
)
print("\nTraining TV classifier on oversampled data...")
clf.fit(X_train, y_on_train)
y_on_pred = clf.predict(X_test)
f1 = f1_score(y_on_test, y_on_pred, zero_division=0)
print(f"TV classifier F1 (oversampled): {f1:.4f}")
print(classification_report(y_on_test, y_on_pred, zero_division=0))

# Train regressor
reg = xgb.XGBRegressor(
    n_estimators=200, 
    max_depth=6, 
    learning_rate=0.1, 
    verbosity=0
)
print("Training TV regressor on balanced data...")
reg.fit(X_train, y_w_train)
y_w_pred = reg.predict(X_test)
mae = mean_absolute_error(y_w_test, y_w_pred)
print(f"TV regressor MAE (oversampled): {mae:.2f} W")

# Save models
base_name = tv_on_col.replace("_on", "")
clf_path = os.path.join(MODEL_DIR, f"{base_name}_clf_oversampled.joblib")
reg_path = os.path.join(MODEL_DIR, f"{base_name}_reg_oversampled.joblib")

joblib.dump(clf, clf_path)
joblib.dump(reg, reg_path)
joblib.dump(feature_columns, os.path.join(MODEL_DIR, f"{base_name}_featcols_oversampled.joblib"))

print(f"\nSaved oversampled models to:\n  {clf_path}\n  {reg_path}")
