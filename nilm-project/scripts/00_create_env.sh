#!/usr/bin/env bash
set -e

# ============================================================================
# 00_create_env.sh
# Creates a conda environment named 'nilm' with all required packages.
# ============================================================================
#
# Usage:
#   bash scripts/00_create_env.sh
#
# After running:
#   conda activate nilm
# ============================================================================

echo "=============================================="
echo "NILM Environment Setup"
echo "=============================================="

ENV_NAME="nilm"
PYTHON_VERSION="3.10"

# Check if conda is available
if ! command -v conda &> /dev/null; then
    echo "ERROR: conda not found. Please install Anaconda or Miniconda first."
    echo "Download from: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Check if environment already exists
if conda env list | grep -q "^${ENV_NAME} "; then
    echo "Environment '${ENV_NAME}' already exists."
    read -p "Do you want to remove and recreate it? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing existing environment..."
        conda env remove -n ${ENV_NAME} -y
    else
        echo "Keeping existing environment. Activating..."
        echo "Run: conda activate ${ENV_NAME}"
        exit 0
    fi
fi

echo ""
echo "Creating conda environment: ${ENV_NAME} (Python ${PYTHON_VERSION})"
echo ""

# Create the environment
conda create -n ${ENV_NAME} python=${PYTHON_VERSION} -y

# Activate and install packages
echo ""
echo "Installing packages..."
echo ""

# Use conda run to install in the new environment
conda run -n ${ENV_NAME} pip install numpy==1.24.3
conda run -n ${ENV_NAME} pip install pandas==1.5.3
conda run -n ${ENV_NAME} pip install scipy==1.10.1
conda run -n ${ENV_NAME} pip install scikit-learn==1.2.2
conda run -n ${ENV_NAME} pip install xgboost==1.7.6
conda run -n ${ENV_NAME} pip install matplotlib==3.7.2
conda run -n ${ENV_NAME} pip install h5py==3.8.0
conda run -n ${ENV_NAME} pip install joblib==1.2.0

echo ""
echo "=============================================="
echo "Environment '${ENV_NAME}' created successfully!"
echo "=============================================="
echo ""
echo "To activate the environment, run:"
echo "  conda activate ${ENV_NAME}"
echo ""
echo "Then run the NILM pipeline:"
echo "  python scripts/preprocess_and_features.py"
echo "  python scripts/train_edge_models.py"
echo "  python scripts/evaluate_edge.py"
echo "  python scripts/inference_edge.py"
echo ""
