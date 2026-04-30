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
#   ./scripts/batch-gff3-to-bigbed.sh                      # default 12-assembly subset, serial
#   ./scripts/batch-gff3-to-bigbed.sh --samples HG00097,HG00099
#   ./scripts/batch-gff3-to-bigbed.sh --first-n 5
#   ./scripts/batch-gff3-to-bigbed.sh --all
#   ./scripts/batch-gff3-to-bigbed.sh --all --jobs 4       # 4 workers in parallel
#
# Destination / credentials:
#   --bucket  s3://NAME       Override the destination S3 bucket. Defaults to
#                             s3://pgb-bigbed. Use this to target a different
#                             AWS account's bucket (e.g. the UCSD-hosted
#                             s3://pgb-browser-custom-annotations).
#   --profile NAME            AWS CLI profile to use for the upload. Defaults
#                             to the AWS_PROFILE env var (or "default" if
#                             unset). Pair with --bucket when the destination
#                             bucket lives in an account other than your
#                             default profile's account.
#
#   Example (UCSD account via SSO profile):
#     ./scripts/batch-gff3-to-bigbed.sh --all --jobs 4 \
#         --bucket s3://pgb-browser-custom-annotations \
#         --profile ucsd-pangenome
#
# Parallelism notes (see --jobs N):
#   - 4–8 is the practical range on a modern laptop.
#   - Each in-flight conversion holds ~1–2 GB of transient disk under
#     data/genomes/ until gff3-to-bigbed.sh cleans up at its end.
#   - Each `sort` uses a few hundred MB of RAM; size --jobs accordingly.
#   - With --jobs >1, per-assembly verbose output goes to
#     data/genomes/logs/<stem>.log; the main stdout gets one line per result
#     ([OK] or [FAIL]), followed by a final success/failure summary.
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
CSV="$APP_ROOT/notes/genomics/custom-assemblies/hprc-annotations.csv"
GENOMES_DIR="$APP_ROOT/data/genomes"
LOGS_DIR="$GENOMES_DIR/logs"
S3_BUCKET="s3://pgb-bigbed"

# Default 12-assembly subset (6 samples × 2 haplotypes)
DEFAULT_SAMPLES="HG00097,HG00099,HG00126,HG00128,HG00133,HG00140"

# --- Argument parsing -------------------------------------------------------

SAMPLES="$DEFAULT_SAMPLES"
FIRST_N=""
ALL=""
JOBS=1
PROFILE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --samples) SAMPLES="$2"; shift 2 ;;
        --first-n) FIRST_N="$2"; SAMPLES=""; shift 2 ;;
        --all)     ALL="1"; SAMPLES=""; shift ;;
        --jobs)    JOBS="$2"; shift 2 ;;
        --bucket)  S3_BUCKET="$2"; shift 2 ;;
        --profile) PROFILE="$2"; shift 2 ;;
        *)         echo "Unknown option: $1"; exit 1 ;;
    esac
done

# --profile is plumbed to the AWS CLI via AWS_PROFILE so the worker function
# (and any nested aws calls) inherit it without each command needing --profile.
if [ -n "$PROFILE" ]; then
    export AWS_PROFILE="$PROFILE"
fi

if ! [[ "$JOBS" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: --jobs must be a positive integer (got: $JOBS)"
    exit 1
fi

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

mkdir -p "$GENOMES_DIR" "$LOGS_DIR"

# --- Pre-fetch bigGenePred.as once ------------------------------------------
# gff3-to-bigbed.sh lazily downloads this to $GENOMES_DIR/bigGenePred.as on
# first use. With --jobs >1, every worker would race on that download/write,
# so we fetch it up-front before the fan-out.

AS_FILE="$GENOMES_DIR/bigGenePred.as"
if [ ! -f "$AS_FILE" ]; then
    echo "Pre-fetching bigGenePred.as ..."
    curl -fsSL -o "$AS_FILE" \
        "https://genome.ucsc.edu/goldenPath/help/examples/bigGenePred.as"
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

echo "============================================================"
echo "Batch GFF3 → BigBed conversion"
echo "============================================================"
echo "  CSV:     $CSV"
echo "  Output:  $GENOMES_DIR"
echo "  Upload:  $S3_BUCKET"
echo "  Profile: ${AWS_PROFILE:-<default>}"
echo "  Total:   $TOTAL assemblies"
echo "  Jobs:    $JOBS"
if [ "$JOBS" -gt 1 ]; then
    echo "  Logs:   $LOGS_DIR/<stem>.log"
fi
echo ""

# --- Worker -----------------------------------------------------------------
# Converts one assembly, uploads the result, emits a single summary line.
# Always returns 0 so a failure does not kill xargs; failure is reported via
# the [FAIL] token in the summary line.

convert_one() {
    local gff3_url="$1" fai_url="$2"
    local stem log bb renamed
    stem="$(basename "$gff3_url" .gff3.gz)"
    stem="${stem%.sorted}"
    log="$LOGS_DIR/${stem}.log"
    bb="$GENOMES_DIR/${stem}.bb"
    renamed="$GENOMES_DIR/${stem}_bigGenePred.bb"

    {
        echo "=== $stem ==="
        echo "GFF3: $gff3_url"
        echo "FAI:  $fai_url"
        echo ""
    } > "$log"

    if "$SCRIPT_DIR/gff3-to-bigbed.sh" "$gff3_url" "$fai_url" >> "$log" 2>&1 \
       && [ -f "$bb" ] \
       && mv "$bb" "$renamed" \
       && aws s3 cp "$renamed" "$S3_BUCKET/$(basename "$renamed")" >> "$log" 2>&1
    then
        echo "[OK]   $stem"
    else
        echo "[FAIL] $stem  (see $log)"
    fi
    return 0
}
export -f convert_one
export SCRIPT_DIR GENOMES_DIR LOGS_DIR S3_BUCKET

# --- Fan out through xargs -P -----------------------------------------------
# Serial path (JOBS=1) also flows through xargs for consistency; the only
# difference vs the old serial loop is log-file redirection, which makes
# parallel and serial behave identically from the user's perspective.

RESULTS_FILE="$(mktemp -t bigbed-batch-XXXXXX)"
trap 'rm -f "$RESULTS_FILE"' EXIT

# xargs -n 2 takes two whitespace-separated tokens (GFF3 URL + FAI URL) per
# invocation. The entries are tab/newline delimited but xargs splits on any
# whitespace, which is fine since the URLs themselves contain no spaces.
# `tee` prints results live while we also capture them for the summary.
echo "$ENTRIES" \
    | xargs -n 2 -P "$JOBS" bash -c 'convert_one "$@"' _ \
    | tee "$RESULTS_FILE"

# --- Summary ----------------------------------------------------------------

OK_COUNT=$(grep -c '^\[OK\] '   "$RESULTS_FILE" || true)
FAIL_COUNT=$(grep -c '^\[FAIL\] ' "$RESULTS_FILE" || true)

echo ""
echo "============================================================"
echo "Batch complete: $OK_COUNT ok, $FAIL_COUNT failed, $TOTAL total."
echo "============================================================"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo ""
    echo "Failed assemblies:"
    grep '^\[FAIL\] ' "$RESULTS_FILE" | sed 's/^/  /'
    echo ""
    echo "Re-run just the failures with:"
    echo "  ./scripts/batch-gff3-to-bigbed.sh --samples <comma-separated-sample-ids>"
    exit 1
fi

echo ""
echo "Verify with: aws s3 ls $S3_BUCKET/"
