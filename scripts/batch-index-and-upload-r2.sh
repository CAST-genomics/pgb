#!/bin/bash
# Download, tabix-index, and upload GFF3 annotation files to Cloudflare R2.
#
# Usage:
#   ./scripts/batch-index-and-upload-r2.sh [--first-n N] [--entry INDEX]
#
# For each registry entry with a GFF3 track:
#   1. Downloads the .gff3.gz from S3
#   2. Decompresses, sorts, recompresses with bgzip
#   3. Creates a tabix index (.tbi)
#   4. Uploads both files to R2
#   5. Updates the registry entry URLs to the R2 public URL
#
# Prerequisites: brew install htslib; npm install -g wrangler

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY="$APP_ROOT/notes/genomics/hprc-assembly-and-annotation-files/assembly-registry.json"
GENOMES_DIR="$APP_ROOT/data/genomes"

# R2 configuration
export CLOUDFLARE_ACCOUNT_ID="1eadb18bb8557fd1bd06b1d0310a902e"
R2_BUCKET="hprc-genomes"
R2_PUBLIC_URL="https://pub-f01aebfa997342239ff267859037de0f.r2.dev"
R2_PREFIX="gff3"

# Check prerequisites
for cmd in bgzip tabix python3 curl wrangler; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: '$cmd' not found."
        [[ "$cmd" == "bgzip" || "$cmd" == "tabix" ]] && echo "Install with: brew install htslib"
        [[ "$cmd" == "wrangler" ]] && echo "Install with: npm install -g wrangler"
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

# Convert registry URL to direct S3 HTTPS URL
# Handles both s3:// and localhost proxy URLs
to_s3_https() {
    local url="$1"
    if [[ "$url" == *"localhost"*"/s3-proxy/"* ]]; then
        # http://localhost:8000/s3-proxy/<bucket>/<path> → https://<bucket>.s3.us-west-2.amazonaws.com/<path>
        local remainder="${url#*/s3-proxy/}"
        local bucket="${remainder%%/*}"
        local path="${remainder#*/}"
        echo "https://${bucket}.s3.us-west-2.amazonaws.com/${path}"
    elif [[ "$url" == s3://* ]]; then
        local bucket path
        bucket="$(echo "$url" | sed 's|s3://\([^/]*\)/.*|\1|')"
        path="$(echo "$url" | sed 's|s3://[^/]*/||')"
        echo "https://${bucket}.s3.us-west-2.amazonaws.com/${path}"
    else
        echo "$url"
    fi
}

# Upload a file to R2
upload_to_r2() {
    local local_file="$1"
    local r2_key="$2"
    local content_type="$3"
    wrangler r2 object put "${R2_BUCKET}/${r2_key}" \
        --file "$local_file" \
        --content-type "$content_type" \
        --remote 2>&1 | grep -v "^$\|wrangler\|───"
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
    R2_GZ_URL="${R2_PUBLIC_URL}/${R2_PREFIX}/${SORTED_GZ}"
    R2_TBI_URL="${R2_PUBLIC_URL}/${R2_PREFIX}/${SORTED_TBI}"

    echo ""
    echo "=== [$COUNT/$TOTAL] Processing entry $IDX: $FNAME ==="

    # Skip if already on R2 (check registry URL)
    CURRENT_URL=$(python3 -c "
import json
with open('$REGISTRY') as f:
    registry = json.load(f)
for t in registry[$IDX].get('tracks', []):
    if t.get('format') == 'gff3':
        print(t.get('url', ''))
        break
")
    if [[ "$CURRENT_URL" == *"r2.dev"* ]]; then
        echo "  Already on R2, skipping."
        continue
    fi

    # Check if already indexed locally
    if [ ! -f "$GENOMES_DIR/$SORTED_GZ" ]; then
        # Download
        HTTPS_URL="$(to_s3_https "$S3_URL")"
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
    else
        echo "  Already indexed locally."
    fi

    # Upload to R2
    echo "  Uploading to R2 ..."
    upload_to_r2 "$GENOMES_DIR/$SORTED_GZ" "${R2_PREFIX}/${SORTED_GZ}" "application/gzip"
    upload_to_r2 "$GENOMES_DIR/$SORTED_TBI" "${R2_PREFIX}/${SORTED_TBI}" "application/octet-stream"

    # Update registry URLs
    echo "  Updating registry ..."
    python3 -c "
import json
with open('$REGISTRY') as f:
    registry = json.load(f)
for t in registry[$IDX].get('tracks', []):
    if t.get('format') == 'gff3':
        t['url'] = '$R2_GZ_URL'
        t['indexURL'] = '$R2_TBI_URL'
with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2)
"

    echo "  Done: $R2_GZ_URL"
done

echo ""
echo "Batch indexing and upload complete."
