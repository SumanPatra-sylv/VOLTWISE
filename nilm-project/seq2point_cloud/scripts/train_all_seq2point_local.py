#!/usr/bin/env python3
"""
Train Seq2Point for multiple appliances in sequence.

Usage:
  python scripts/train_all_seq2point_local.py --appliances fridge ac geyser

This script calls the single-appliance trainer function (adapted inline) for each appliance.
It is safe to run on a single GPU: models are trained sequentially (one after another).
"""
import argparse
import subprocess
import shlex
import os
import sys

SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), "train_seq2point_iAWE_local.py"))

def run_for_appliance(appliance):
    cmd = f"python {shlex.quote(SCRIPT)} --appliance {shlex.quote(appliance)}"
    print("Running:", cmd)
    ret = os.system(cmd)
    if ret != 0:
        print(f"Training for {appliance} exited with code {ret}. Stopping.")
        sys.exit(ret)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--appliances", "-a", nargs="+", required=True,
                        help="List of appliances to train, e.g. fridge ac geyser")
    args = parser.parse_args()
    for app in args.appliances:
        run_for_appliance(app)
    print("All requested appliances trained.")
