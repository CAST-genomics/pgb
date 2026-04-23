#!/bin/bash
# ============================================================================
# batch-gff3-to-bigbed.sh — Convert HPRC annotation GFF3 files to BigBed and
# upload to the pgb-bigbed S3 bucket.
#
# Source of truth:
#   notes/genomics/custom-assemblies/hprc-annotations.csv
#     columns: sample_id,haplotype,assembly_name,location
#     `location` is the s3:// URL of the raw .gff3.gz on HPRC's public bucket.
#
# The companion .fa.gz.fai URL is derived from the annotation path:
#   s3://.../assemblies/release2/annotation/cat/<name>_cat_v1.1.gff3.gz
#     → s3://.../assemblies/release2/<name>.fa.gz.fai
#
# Both URLs are converted to public HTTPS (CORS-enabled) before being handed
# to gff3-to-bigbed.sh. GitHub is not involved — we go straight to HPRC S3.
#
# Usage:
#   conda activate bigbed
#   ./scripts/batch-gff3-to-bigbed.sh                   # default 12-assembly subset
#   ./scripts/batch-gff3-to-bigbed.sh --samples HG00097,HG00099
#   ./scripts/batch-gff3-to-bigbed.sh --first-n 5
#   ./scripts/batch-gff3-to-bigbed.sh --all
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
CSV="$APP_ROOT/notes/genomics/custom-assemblies/hprc-annotations.csv"
GENOMES_DIR="$APP_ROOT/data/genomes"
S3_BUCKET="s3://pgb-bigbed"

# Default 12-assembly subset (6 samples × 2 haplotypes)
DEFAULT_SAMPLES="HG00097,HG00099,HG00126,HG00128,HG00133,HG00140"

# --- Argument parsing -------------------------------------------------------

SAMPLES="$DEFAULT_SAMPLES"
FIRST_N=""
ALL=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --samples) SAMPLES="$2"; shift 2 ;;
        --first-n) FIRST_N="$2"; SAMPLES=""; shift 2 ;;
        --all)     ALL="1"; SAMPLES=""; shift ;;
        *)         echo "Unknown option: $1"; exit 1 ;;
    esac
done

# --- Check prerequisites ----------------------------------------------------

for cmd in gff3ToGenePred genePredToBigGenePred bedToBigBed curl python3 aws; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: $cmd not found. Install UCSC tools (conda activate bigbed) and AWS CLI."
        exit 1
    fi
done

if [ ! -f "$CSV" ]; then
    echo "Error: CSV not found at $CSV"
    exit 1
fi

# --- Select entries from the CSV --------------------------------------------
#
# Emits tab-separated "<gff3_https_url>\t<fai_https_url>" lines.

ENTRIES=$(SAMPLES="$SAMPLES" FIRST_N="$FIRST_N" ALL="$ALL" python3 - "$CSV" <<'PY'
import csv, os, re, sys

csv_path = sys.argv[1]
samples  = os.environ.get("SAMPLES", "")
first_n  = os.environ.get("FIRST_N", "")
all_flag = os.environ.get("ALL", "")

sample_filter = set(s.strip() for s in samples.split(",") if s.strip()) if samples else None

def s3_to_https(s3_url):
    # s3://bucket/path → https://bucket.s3.us-west-2.amazonaws.com/path
    m = re.match(r"s3://([^/]+)/(.+)", s3_url)
    if not m:
        raise ValueError(f"Not an s3 URL: {s3_url}")
    return f"https://{m.group(1)}.s3.us-west-2.amazonaws.com/{m.group(2)}"

def derive_fai(gff3_s3):
    # strip "annotation/cat/" and "_cat_v1.1.gff3.gz", append ".fa.gz.fai"
    m = re.match(r"(s3://.+/release2)/annotation/cat/(.+?)_cat_v[\d.]+\.gff3\.gz$", gff3_s3)
    if not m:
        raise ValueError(f"Unexpected GFF3 path shape: {gff3_s3}")
    return f"{m.group(1)}/{m.group(2)}.fa.gz.fai"

rows = []
with open(csv_path) as f:
    reader = csv.DictReader(f)
    for row in reader:
        if sample_filter is not None and row["sample_id"] not in sample_filter:
            continue
        rows.append(row)

if first_n:
    rows = rows[:int(first_n)]

for row in rows:
    gff3_s3 = row["location"]
    fai_s3  = derive_fai(gff3_s3)
    print(f"{s3_to_https(gff3_s3)}\t{s3_to_https(fai_s3)}")
PY
)

if [ -z "$ENTRIES" ]; then
    echo "No entries matched. Check --samples / --first-n / --all."
    exit 1
fi

TOTAL=$(echo "$ENTRIES" | wc -l | tr -d ' ')
COUNT=0

echo "============================================================"
echo "Batch GFF3 → BigBed conversion"
echo "============================================================"
echo "  CSV:    $CSV"
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
