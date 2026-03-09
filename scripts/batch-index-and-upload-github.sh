#!/bin/bash
# Download, tabix-index, and upload GFF3 annotation files to GitHub.
#
# Usage:
#   ./scripts/batch-index-and-upload-github.sh
#
# For each of the 12 assemblies in the target list:
#   1. Downloads the .gff3.gz from S3
#   2. Decompresses, sorts, recompresses with bgzip
#   3. Creates a tabix index (.tbi)
#   4. Commits both files to the local clone of turner/hprc-annotations
#
# After all files are processed, pushes to GitHub in a single push.
#
# Prerequisites: brew install htslib

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
WORK_DIR="$APP_ROOT/data/genomes"
REPO_DIR="/tmp/hprc-annotations"
ANNOTATIONS_CSV="$APP_ROOT/notes/genomics/custom-assemblies/hprc-annotations.csv"

# The 12 assembly names to process
ASSEMBLIES=(
    HG00097_hap1_hprc_r2_v1.0.1
    HG00097_hap2_hprc_r2_v1.0.1
    HG00099_hap1_hprc_r2_v1.0.1
    HG00099_hap2_hprc_r2_v1.0.1
    HG00126_hap1_hprc_r2_v1.0.1
    HG00126_hap2_hprc_r2_v1.0.1
    HG00128_hap1_hprc_r2_v1.0.1
    HG00128_hap2_hprc_r2_v1.0.1
    HG00133_hap1_hprc_r2_v1.0.1
    HG00133_hap2_hprc_r2_v1.0.1
    HG00140_hap1_hprc_r2_v1.0.1
    HG00140_hap2_hprc_r2_v1.0.1
)

# Check prerequisites
for cmd in bgzip tabix curl; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: '$cmd' not found."
        [[ "$cmd" == "bgzip" || "$cmd" == "tabix" ]] && echo "Install with: brew install htslib"
        exit 1
    fi
done

mkdir -p "$WORK_DIR"

# Clone or update the GitHub repo
if [ -d "$REPO_DIR" ]; then
    echo "Updating existing clone at $REPO_DIR ..."
    cd "$REPO_DIR" && git pull
else
    echo "Cloning turner/hprc-annotations ..."
    gh repo clone turner/hprc-annotations "$REPO_DIR"
fi

mkdir -p "$REPO_DIR/gff3"

TOTAL=${#ASSEMBLIES[@]}
COUNT=0

for ASSEMBLY_NAME in "${ASSEMBLIES[@]}"; do
    COUNT=$((COUNT + 1))
    SAMPLE="${ASSEMBLY_NAME%%_*}"
    GFF3_GZ="${ASSEMBLY_NAME}_cat_v1.1.gff3.gz"
    SORTED_GZ="${ASSEMBLY_NAME}_cat_v1.1.sorted.gff3.gz"
    SORTED_TBI="${SORTED_GZ}.tbi"

    echo ""
    echo "=== [$COUNT/$TOTAL] Processing $ASSEMBLY_NAME ==="

    # Skip if already in the repo
    if [ -f "$REPO_DIR/gff3/$SORTED_GZ" ] && [ -f "$REPO_DIR/gff3/$SORTED_TBI" ]; then
        echo "  Already in repo, skipping."
        continue
    fi

    # Skip indexing if already done locally
    if [ -f "$WORK_DIR/$SORTED_GZ" ] && [ -f "$WORK_DIR/$SORTED_TBI" ]; then
        echo "  Already indexed locally."
    else
        # Construct S3 HTTPS URL
        S3_URL="https://human-pangenomics.s3.us-west-2.amazonaws.com/working/HPRC/${SAMPLE}/assemblies/release2/annotation/cat/${GFF3_GZ}"

        # Download
        echo "  Downloading from S3 ..."
        curl -# -o "$WORK_DIR/$GFF3_GZ" "$S3_URL"

        # Decompress
        echo "  Decompressing ..."
        gunzip -f "$WORK_DIR/$GFF3_GZ"
        GFF3_FILE="$WORK_DIR/${ASSEMBLY_NAME}_cat_v1.1.gff3"

        # Sort
        echo "  Sorting by chromosome and position ..."
        (grep "^#" "$GFF3_FILE"; grep -v "^#" "$GFF3_FILE" | sort -t$'\t' -k1,1 -k4,4n) > "$WORK_DIR/${ASSEMBLY_NAME}_cat_v1.1.sorted.gff3"

        # Compress with bgzip
        echo "  Compressing with bgzip ..."
        bgzip -f "$WORK_DIR/${ASSEMBLY_NAME}_cat_v1.1.sorted.gff3"

        # Create tabix index
        echo "  Creating tabix index ..."
        tabix -p gff "$WORK_DIR/$SORTED_GZ"

        # Clean up raw file
        rm -f "$GFF3_FILE"
    fi

    # Copy to repo
    echo "  Copying to repo ..."
    cp "$WORK_DIR/$SORTED_GZ" "$REPO_DIR/gff3/"
    cp "$WORK_DIR/$SORTED_TBI" "$REPO_DIR/gff3/"

    # Commit this assembly (keeps history granular)
    cd "$REPO_DIR"
    git add "gff3/$SORTED_GZ" "gff3/$SORTED_TBI"
    git commit -m "Add indexed GFF3 for $ASSEMBLY_NAME"
    cd "$APP_ROOT"

    echo "  Done."
done

# Push all commits to GitHub
echo ""
echo "Pushing to GitHub ..."
cd "$REPO_DIR" && git push

echo ""
echo "Batch indexing and upload to GitHub complete."
echo "Files are at: https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/"
