#!/usr/bin/env bash
set -e

# ============================================================================
# 01_extract_and_list.sh
# Helper script to extract dataset archives and list available files.
# ============================================================================
#
# Place your downloaded archives in data/raw/:
#   - iAWE: electricity.tar.gz or similar
#   - REDD: low_freq.tar.bz2 (optional)
#
# Usage:
#   bash scripts/01_extract_and_list.sh
# ============================================================================

echo "=============================================="
echo "Dataset Extraction Helper"
echo "=============================================="

# Set paths (adjust if your project is elsewhere)
PROJECT_DIR="${HOME}/nilm-project"
DATA_RAW_DIR="${PROJECT_DIR}/data/raw"
IAWE_DIR="${DATA_RAW_DIR}/iawe"

# Create directories if they don't exist
mkdir -p "${IAWE_DIR}"
mkdir -p "${DATA_RAW_DIR}/redd"

echo ""
echo "Looking for archives in: ${DATA_RAW_DIR}"
echo ""

# ============================================================================
# Extract iAWE archives
# ============================================================================

echo "--- iAWE Dataset ---"

# Look for common iAWE archive names
IAWE_ARCHIVES=(
    "electricity.tar.gz"
    "iawe.tar.gz"
    "iawe_electricity.tar.gz"
    "electricity.zip"
    "iawe.zip"
)

FOUND_IAWE=false
for archive in "${IAWE_ARCHIVES[@]}"; do
    if [ -f "${DATA_RAW_DIR}/${archive}" ]; then
        echo "Found: ${archive}"
        FOUND_IAWE=true
        
        if [[ "${archive}" == *.tar.gz ]]; then
            echo "Extracting ${archive} to ${IAWE_DIR}..."
            tar -xzf "${DATA_RAW_DIR}/${archive}" -C "${IAWE_DIR}"
        elif [[ "${archive}" == *.zip ]]; then
            echo "Extracting ${archive} to ${IAWE_DIR}..."
            unzip -o "${DATA_RAW_DIR}/${archive}" -d "${IAWE_DIR}"
        fi
        echo "Done extracting ${archive}"
    fi
done

if [ "$FOUND_IAWE" = false ]; then
    echo "No iAWE archive found in ${DATA_RAW_DIR}"
    echo "Expected files: ${IAWE_ARCHIVES[*]}"
    echo ""
    echo "Please download the iAWE dataset and place it in ${DATA_RAW_DIR}"
fi

# ============================================================================
# Extract REDD archives (optional)
# ============================================================================

echo ""
echo "--- REDD Dataset (optional) ---"

if [ -f "${DATA_RAW_DIR}/low_freq.tar.bz2" ]; then
    echo "Found: low_freq.tar.bz2"
    echo "Extracting to ${DATA_RAW_DIR}/redd/..."
    tar -xjf "${DATA_RAW_DIR}/low_freq.tar.bz2" -C "${DATA_RAW_DIR}/redd"
    echo "Done extracting REDD"
elif [ -f "${DATA_RAW_DIR}/redd_low_freq.tar.bz2" ]; then
    echo "Found: redd_low_freq.tar.bz2"
    echo "Extracting to ${DATA_RAW_DIR}/redd/..."
    tar -xjf "${DATA_RAW_DIR}/redd_low_freq.tar.bz2" -C "${DATA_RAW_DIR}/redd"
    echo "Done extracting REDD"
else
    echo "No REDD archive found (this is optional)"
fi

# ============================================================================
# List available files
# ============================================================================

echo ""
echo "=============================================="
echo "Available CSV files in iAWE directory:"
echo "=============================================="

if [ -d "${IAWE_DIR}" ]; then
    # Find and list CSV files
    CSV_COUNT=$(find "${IAWE_DIR}" -name "*.csv" -type f 2>/dev/null | wc -l)
    
    if [ "$CSV_COUNT" -gt 0 ]; then
        echo ""
        find "${IAWE_DIR}" -name "*.csv" -type f | while read -r file; do
            # Get file size
            SIZE=$(du -h "$file" | cut -f1)
            # Get line count (approximate row count)
            LINES=$(wc -l < "$file")
            echo "  $(basename "$file") - ${SIZE}, ~${LINES} rows"
        done
        echo ""
        echo "Total CSV files: ${CSV_COUNT}"
    else
        echo "No CSV files found in ${IAWE_DIR}"
        echo ""
        echo "Please ensure your CSV files are placed directly in:"
        echo "  ${IAWE_DIR}"
    fi
else
    echo "iAWE directory does not exist: ${IAWE_DIR}"
    echo "Creating it now..."
    mkdir -p "${IAWE_DIR}"
    echo "Please place your CSV files in: ${IAWE_DIR}"
fi

echo ""
echo "=============================================="
echo "Next steps:"
echo "=============================================="
echo "1. Ensure CSV files are in: ${IAWE_DIR}"
echo "2. Run: python scripts/preprocess_and_features.py"
echo "3. Run: python scripts/train_edge_models.py"
echo ""
