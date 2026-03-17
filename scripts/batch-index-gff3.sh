#!/bin/bash
# Download and tabix-index GFF3 annotation files from S3 for the assembly registry.
#
# Usage:
#   ./scripts/batch-index-gff3.sh [--first-n N] [--entry INDEX]
#
# Options:
#   --first-n N     Process only the first N entries
#   --entry INDEX   Process a single entry by zero-based index
#   (no options)    Process all entries
#
# For each registry entry with a GFF3 track:
#   1. Downloads the .gff3.gz from S3
#   2. Decompresses, sorts, recompresses with bgzip
#   3. Creates a tabix index (.tbi)
#   4. Updates the registry entry's track indexURL to the local server URL
#
# Output files go to data/genomes/
# Prerequisites: brew install htslib

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY="$APP_ROOT/notes/genomics/hprc-assembly-and-annotation-files/assembly-registry.json"
GENOMES_DIR="$APP_ROOT/data/genomes"
LOCAL_SERVER="http://localhost:8000/data/genomes"

# Check prerequisites
for cmd in bgzip tabix python3 curl; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: '$cmd' not found."
        [[ "$cmd" == "bgzip" || "$cmd" == "tabix" ]] && echo "Install with: brew install htslib"
        exit 1
    fi
done

mkdir -p "$GENOMES_DIR"

# Parse arguments
FIRST_N=""
ENTRY_INDEX=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --first-n) FIRST_N="$2"; shift 2 ;;
        --entry)   ENTRY_INDEX="$2"; shift 2 ;;
        *)         echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Convert s3:// URL to public HTTPS URL
s3_to_https() {
    local s3_url="$1"
    # s3://human-pangenomics/path -> https://human-pangenomics.s3.us-west-2.amazonaws.com/path
    local bucket path
    bucket="$(echo "$s3_url" | sed 's|s3://\([^/]*\)/.*|\1|')"
    path="$(echo "$s3_url" | sed 's|s3://[^/]*/||')"
    echo "https://${bucket}.s3.us-west-2.amazonaws.com/${path}"
}

# Get list of entries to process
ENTRIES=$(python3 -c "
import json, sys
with open('$REGISTRY') as f:
    registry = json.load(f)
first_n = '$FIRST_N'
entry_index = '$ENTRY_INDEX'
if entry_index:
    indices = [int(entry_index)]
elif first_n:
    indices = list(range(min(int(first_n), len(registry))))
else:
    indices = list(range(len(registry)))
for i in indices:
    e = registry[i]
    tracks = [t for t in e.get('tracks', []) if t.get('format') == 'gff3']
    if tracks:
        print(f'{i}\t{tracks[0][\"url\"]}')
")

if [ -z "$ENTRIES" ]; then
    echo "No entries to process."
    exit 0
fi

TOTAL=$(echo "$ENTRIES" | wc -l | tr -d ' ')
COUNT=0

echo "$ENTRIES" | while IFS=$'\t' read -r IDX S3_URL; do
    COUNT=$((COUNT + 1))
    FNAME="$(basename "$S3_URL")"
    STEM="${FNAME%.gff3.gz}"
    SORTED_GZ="${STEM}.sorted.gff3.gz"
    SORTED_TBI="${SORTED_GZ}.tbi"

    echo ""
    echo "=== [$COUNT/$TOTAL] Processing entry $IDX: $FNAME ==="

    # Skip if already indexed
    if [ -f "$GENOMES_DIR/$SORTED_TBI" ]; then
        echo "  Already indexed, skipping download. Updating registry."
        python3 -c "
import json
with open('$REGISTRY') as f:
    registry = json.load(f)
for t in registry[$IDX].get('tracks', []):
    if t.get('format') == 'gff3':
        t['indexURL'] = '$LOCAL_SERVER/$SORTED_TBI'
        t['url'] = '$LOCAL_SERVER/$SORTED_GZ'
with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2)
"
        continue
    fi

    # Download
    HTTPS_URL="$(s3_to_https "$S3_URL")"
    echo "  Downloading from S3 ..."
    curl -# -o "$GENOMES_DIR/$FNAME" "$HTTPS_URL"

    # Decompress
    echo "  Decompressing ..."
    gunzip -f "$GENOMES_DIR/$FNAME"
    GFF3_FILE="$GENOMES_DIR/${STEM}.gff3"

    # Sort
    echo "  Sorting by chromosome and position ..."
    (grep "^#" "$GFF3_FILE"; grep -v "^#" "$GFF3_FILE" | sort -t$'\t' -k1,1 -k4,4n) > "$GENOMES_DIR/${STEM}.sorted.gff3"

    # Compress with bgzip
    echo "  Compressing with bgzip ..."
    bgzip -f "$GENOMES_DIR/${STEM}.sorted.gff3"

    # Create tabix index
    echo "  Creating tabix index ..."
    tabix -p gff "$GENOMES_DIR/$SORTED_GZ"

    # Clean up raw files
    rm -f "$GFF3_FILE"

    # Update registry
    echo "  Updating registry ..."
    python3 -c "
import json
with open('$REGISTRY') as f:
    registry = json.load(f)
for t in registry[$IDX].get('tracks', []):
    if t.get('format') == 'gff3':
        t['indexURL'] = '$LOCAL_SERVER/$SORTED_TBI'
        t['url'] = '$LOCAL_SERVER/$SORTED_GZ'
with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2)
"

    echo "  Done: $SORTED_GZ + $SORTED_TBI"
done

echo ""
echo "Batch indexing complete."
