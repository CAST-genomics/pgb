#!/bin/bash
# ============================================================================
# gff3-to-bigbed.sh — Convert a GFF3 annotation file to BigBed format
# ============================================================================
#
# Background:
#   BigBed is a binary, self-indexed format created by the UCSC Genome Browser
#   team. Unlike GFF3 + tabix (which requires two files: .gff3.gz and .tbi),
#   a BigBed file embeds an R-tree spatial index directly in the file. This
#   means:
#     - Only ONE file to host (no separate index)
#     - Clients (e.g. IGV.js) can use HTTP Range requests for random access
#     - No server-side preprocessing needed — just serve the static .bb file
#
#   This script exists because the HPRC collaboration team plans to provide
#   annotation tracks in BigBed format rather than sorted/indexed GFF3. This
#   script lets us test BigBed locally before those files are available.
#
# What it does:
#   1. Downloads a GFF3 annotation file (gzipped) from a URL
#   2. Extracts chromosome sizes from the companion FASTA index (.fai)
#   3. Converts GFF3 → BED12 using gffread (preserves gene structure)
#   4. Sorts the BED12 file by chromosome and position
#   5. Converts sorted BED12 → BigBed using UCSC's bedToBigBed
#   6. Optionally creates a PGB-compatible JSON assembly config
#
# Conversion pipeline:
#   .gff3.gz → gffread → .bed12 → sort → bedToBigBed → .bb
#
# Output:
#   data/genomes/<assembly-name>.bb         — the BigBed file
#   data/genomes/<assembly-name>.chrom.sizes — chrom sizes (intermediate, kept for reference)
#   (optional) data/genomes/<assembly-name>-bigbed.json — PGB assembly config
#
# Usage:
#   ./scripts/gff3-to-bigbed.sh <gff3-url> <fai-url> [--assembly-json <assembly-json-file>]
#
# Example (HG00097#1):
#   ./scripts/gff3-to-bigbed.sh \
#     https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz \
#     https://human-pangenomics.s3.amazonaws.com/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai
#
# Example with assembly JSON generation:
#   ./scripts/gff3-to-bigbed.sh \
#     https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz \
#     https://human-pangenomics.s3.amazonaws.com/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai \
#     --assembly-json public/single-custom-assembly-s3-cors-enabled.json
#
# Prerequisites:
#   conda create -n bigbed -y --override-channels -c bioconda -c conda-forge gffread ucsc-bedtobigbed
#   conda activate bigbed
#
#   Alternatively, install via Homebrew or download binaries directly:
#     brew install gffread
#     Download bedToBigBed from UCSC:
#       https://hgdownload.soe.ucsc.edu/admin/exe/macOSX.arm64/bedToBigBed
#       (make it executable and place on your PATH)
#
# ============================================================================

set -e

# --- Argument parsing -------------------------------------------------------

if [ $# -lt 2 ]; then
    echo "Usage: $0 <gff3-url> <fai-url> [--assembly-json <assembly-json-file>]"
    echo ""
    echo "  gff3-url          URL to a .gff3.gz annotation file"
    echo "  fai-url           URL to the .fa.gz.fai FASTA index"
    echo "  --assembly-json   (optional) path to an existing PGB assembly JSON;"
    echo "                    a BigBed variant will be created alongside it"
    exit 1
fi

GFF3_URL="$1"
FAI_URL="$2"
ASSEMBLY_JSON=""

shift 2
while [[ $# -gt 0 ]]; do
    case "$1" in
        --assembly-json) ASSEMBLY_JSON="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# --- Check prerequisites ----------------------------------------------------

MISSING=""
for cmd in gffread bedToBigBed curl python3; do
    if ! command -v "$cmd" &> /dev/null; then
        MISSING="$MISSING $cmd"
    fi
done

if [ -n "$MISSING" ]; then
    echo "Error: missing required tools:$MISSING"
    echo ""
    echo "Install with:"
    echo "  brew install gffread       # GFF3 → BED conversion"
    echo "  brew install kent-tools    # bedToBigBed"
    echo "  — or download bedToBigBed from UCSC:"
    echo "    https://hgdownload.soe.ucsc.edu/admin/exe/macOSX.arm64/bedToBigBed"
    exit 1
fi

# --- Set up paths -----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
GENOMES_DIR="$APP_ROOT/data/genomes"
mkdir -p "$GENOMES_DIR"

# Derive stem name from the GFF3 filename
GFF3_FNAME="$(basename "$GFF3_URL")"
# Strip .sorted.gff3.gz or .gff3.gz
STEM="${GFF3_FNAME%.gff3.gz}"
STEM="${STEM%.sorted}"

echo "============================================================"
echo "GFF3 → BigBed conversion"
echo "============================================================"
echo "  GFF3:  $GFF3_URL"
echo "  FAI:   $FAI_URL"
echo "  Stem:  $STEM"
echo ""

# --- Step 1: Download the FASTA index and extract chrom sizes ---------------

echo "Step 1/5: Downloading FASTA index and extracting chrom sizes ..."
FAI_FILE="$GENOMES_DIR/${STEM}.fai"
curl -# -L -o "$FAI_FILE" "$FAI_URL"

# .fai format: name \t length \t offset \t linebases \t linewidth
# chrom.sizes needs: name \t length
CHROM_SIZES="$GENOMES_DIR/${STEM}.chrom.sizes"
cut -f1,2 "$FAI_FILE" > "$CHROM_SIZES"

NCHROM=$(wc -l < "$CHROM_SIZES" | tr -d ' ')
echo "  Found $NCHROM chromosomes/contigs."

# --- Step 2: Download the GFF3 file ----------------------------------------

echo ""
echo "Step 2/5: Downloading GFF3 annotation ..."
GFF3_GZ="$GENOMES_DIR/$GFF3_FNAME"
curl -# -L -o "$GFF3_GZ" "$GFF3_URL"

# Decompress if gzipped
GFF3_PLAIN="${GFF3_GZ%.gz}"
if [[ "$GFF3_GZ" == *.gz ]]; then
    echo "  Decompressing ..."
    gunzip -f "$GFF3_GZ"
fi

# --- Step 3: Convert GFF3 → BED12 using gffread ----------------------------

echo ""
echo "Step 3/5: Converting GFF3 → BED12 with gffread ..."
BED_FILE="$GENOMES_DIR/${STEM}.bed"

# gffread --bed outputs BED12+ format (preserving transcript→exon block structure).
# It appends a 13th column with gene metadata — we strip it to get standard BED12
# since bedToBigBed -type=bed12 requires exactly 12 columns.
gffread "$GFF3_PLAIN" --bed -o /dev/stdout | cut -f1-12 > "$BED_FILE"

NLINES=$(wc -l < "$BED_FILE" | tr -d ' ')
echo "  Produced $NLINES BED12 records."

# --- Step 4: Sort the BED file ----------------------------------------------

echo ""
echo "Step 4/5: Sorting BED by chromosome and position ..."
SORTED_BED="$GENOMES_DIR/${STEM}.sorted.bed"
sort -k1,1 -k2,2n "$BED_FILE" > "$SORTED_BED"

# --- Step 5: Convert sorted BED12 → BigBed ----------------------------------

echo ""
echo "Step 5/5: Converting to BigBed with bedToBigBed ..."
BB_FILE="$GENOMES_DIR/${STEM}.bb"

# bedToBigBed requires: input.bed chrom.sizes output.bb
# -type=bed12 tells it to expect 12-column BED (gene structure with blocks)
bedToBigBed -type=bed12 "$SORTED_BED" "$CHROM_SIZES" "$BB_FILE"

BB_SIZE=$(ls -lh "$BB_FILE" | awk '{print $5}')
echo "  BigBed file: $BB_FILE ($BB_SIZE)"

# --- Clean up intermediate files --------------------------------------------

rm -f "$GFF3_PLAIN" "$FAI_FILE" "$BED_FILE" "$SORTED_BED"
echo ""
echo "  Cleaned up intermediate files (kept chrom.sizes for reference)."

# --- Optional: Generate PGB assembly JSON -----------------------------------

if [ -n "$ASSEMBLY_JSON" ]; then
    echo ""
    echo "Generating PGB assembly JSON config ..."

    # Determine output path: sibling of the input JSON with -bigbed suffix
    JSON_DIR="$(dirname "$ASSEMBLY_JSON")"
    JSON_BASE="$(basename "$ASSEMBLY_JSON" .json)"
    OUTPUT_JSON="$JSON_DIR/${JSON_BASE}-bigbed.json"

    # Use python3 to read the source JSON and produce a BigBed variant
    python3 -c "
import json, sys

with open('$ASSEMBLY_JSON') as f:
    config = json.load(f)

# Replace the track with a BigBed track pointing to the local server
bb_filename = '${STEM}.bb'
config['tracks'] = [
    {
        'name': 'Gene annotations (BigBed)',
        'url': 'http://localhost:8000/data/genomes/' + bb_filename,
        'format': 'bigbed'
    }
]

with open('$OUTPUT_JSON', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print(f'  Written: $OUTPUT_JSON')
"

    echo ""
    echo "  To test in PGB, load this assembly config and ensure the"
    echo "  local S3 proxy server is running (./scripts/run-local-s3-proxy-server.sh)"
fi

# --- Summary ----------------------------------------------------------------

echo ""
echo "============================================================"
echo "Done!"
echo "============================================================"
echo ""
echo "Output:"
echo "  BigBed file:  $BB_FILE"
echo "  Chrom sizes:  $CHROM_SIZES"
[ -n "$ASSEMBLY_JSON" ] && echo "  Assembly JSON: $OUTPUT_JSON"
echo ""
echo "To serve locally, the BigBed file is at:"
echo "  http://localhost:8000/data/genomes/$(basename "$BB_FILE")"
echo ""
echo "IGV.js track config (no indexURL needed — BigBed is self-indexed):"
echo "  {"
echo "    \"name\": \"Gene annotations\","
echo "    \"url\": \"http://localhost:8000/data/genomes/$(basename "$BB_FILE")\","
echo "    \"format\": \"bigbed\""
echo "  }"
