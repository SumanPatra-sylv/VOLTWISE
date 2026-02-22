#!/usr/bin/env python3
"""Check class counts for all appliances in labels.csv"""
import pandas as pd
import os

p = "data/processed/labels.csv"
if not os.path.isfile(p):
    print("labels.csv not found at data/processed/labels.csv. Run preprocess first.")
else:
    df = pd.read_csv(p)
    total = len(df)
    print(f"Total windows: {total}")
    for c in df.columns:
        if c.endswith("_on"):
            s = int(df[c].sum())
            print(f"{c}: {s} ON windows / {total} total  (ON_fraction={s/total:.4f})")
