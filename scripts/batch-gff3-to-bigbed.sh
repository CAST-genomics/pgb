#!/bin/bash
# ============================================================================
# batch-gff3-to-bigbed.sh — Convert all 12 HPRC annotation GFF3 files to
# BigBed format and upload to the pgb-bigbed S3 bucket.
#
# Reads assembly configs from the JSON file to get GFF3 URLs (GitHub) and
# FAI URLs (S3), runs gff3-to-bigbed.sh for each, then uploads the .bb files.
#
# Usage:
#   conda activate bigbed
#   ./scripts/batch-gff3-to-bigbed.sh
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_JSON="$APP_ROOT/public/custom-assemblies/custom-assemblies-12-s3-cors-enabled.json"
GENOMES_DIR="$APP_ROOT/data/genomes"
S3_BUCKET="s3://pgb-bigbed"

# Check prerequisites
for cmd in gff3ToGenePred genePredToBigGenePred bedToBigBed curl python3 aws; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: $cmd not found. Install UCSC tools (conda activate bigbed) and AWS CLI."
        exit 1
    fi
done

# Parse the JSON config to extract GFF3 and FAI URLs
ENTRIES=$(python3 -c "
import json
with open('$CONFIG_JSON') as f:
    assemblies = json.load(f)
for a in assemblies:
    gff3_url = a['tracks'][0]['url']
    fai_url = a['indexURL']
    print(f'{gff3_url}\t{fai_url}')
")

TOTAL=$(echo "$ENTRIES" | wc -l | tr -d ' ')
COUNT=0

echo "============================================================"
echo "Batch GFF3 → BigBed conversion"
echo "============================================================"
echo "  Config: $CONFIG_JSON"
echo "  Output: $GENOMES_DIR"
echo "  Upload: $S3_BUCKET"
echo "  Total:  $TOTAL assemblies"
echo ""

while IFS=$'\t' read -r GFF3_URL FAI_URL; do
    COUNT=$((COUNT + 1))
    STEM=$(basename "$GFF3_URL" .gff3.gz)
    STEM="${STEM%.sorted}"

    echo ""
    echo "============================================================"
    echo "[$COUNT/$TOTAL] $STEM"
    echo "============================================================"

    "$SCRIPT_DIR/gff3-to-bigbed.sh" "$GFF3_URL" "$FAI_URL"

    BB_FILE="$GENOMES_DIR/${STEM}.bb"
    RENAMED_BB="$GENOMES_DIR/${STEM}_bigGenePred.bb"
    if [ -f "$BB_FILE" ]; then
        mv "$BB_FILE" "$RENAMED_BB"
        echo ""
        echo "Uploading $(basename "$RENAMED_BB") to $S3_BUCKET ..."
        aws s3 cp "$RENAMED_BB" "$S3_BUCKET/$(basename "$RENAMED_BB")"
        echo "  Done."
    else
        echo "ERROR: Expected $BB_FILE not found — skipping upload."
    fi

done <<< "$ENTRIES"

echo ""
echo "============================================================"
echo "Batch complete! $COUNT/$TOTAL assemblies processed."
echo "============================================================"
echo ""
echo "Verify with: aws s3 ls $S3_BUCKET/"
