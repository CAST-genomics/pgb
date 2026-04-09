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
#   3. Converts GFF3 → genePred using gff3ToGenePred
#   4. Converts genePred → bigGenePred using genePredToBigGenePred
#   5. Sorts the bigGenePred file by chromosome and position
#   6. Converts sorted bigGenePred → BigBed using UCSC's bedToBigBed
#      with bed12+8 type and bigGenePred.as AutoSQL schema
#   7. Optionally creates a PGB-compatible JSON assembly config
#
# Conversion pipeline:
#   .gff3.gz → gff3ToGenePred → .genePred → genePredToBigGenePred → .bigGenePred → sort → bedToBigBed -type=bed12+8 → .bb
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
#   conda create -n bigbed -y --override-channels -c bioconda -c conda-forge ucsc-gff3togenepred ucsc-genepredtobiggenepred ucsc-bedtobigbed
#   conda activate bigbed
#
#   Alternatively, download UCSC binaries directly:
#     https://hgdownload.soe.ucsc.edu/admin/exe/macOSX.arm64/
#     (download gff3ToGenePred, genePredToBigGenePred, bedToBigBed;
#      make them executable and place on your PATH)
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
for cmd in gff3ToGenePred genePredToBigGenePred bedToBigBed curl python3; do
    if ! command -v "$cmd" &> /dev/null; then
        MISSING="$MISSING $cmd"
    fi
done

if [ -n "$MISSING" ]; then
    echo "Error: missing required tools:$MISSING"
    echo ""
    echo "Install with:"
    echo "  conda create -n bigbed -y --override-channels -c bioconda -c conda-forge \\"
    echo "    ucsc-gff3togenepred ucsc-genepredtobiggenepred ucsc-bedtobigbed"
    echo "  — or download from UCSC:"
    echo "    https://hgdownload.soe.ucsc.edu/admin/exe/macOSX.arm64/"
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

echo "Step 1/6: Downloading FASTA index and extracting chrom sizes ..."
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
echo "Step 2/6: Downloading GFF3 annotation ..."
GFF3_GZ="$GENOMES_DIR/$GFF3_FNAME"
curl -# -L -o "$GFF3_GZ" "$GFF3_URL"

# Decompress if gzipped
GFF3_PLAIN="${GFF3_GZ%.gz}"
if [[ "$GFF3_GZ" == *.gz ]]; then
    echo "  Decompressing ..."
    gunzip -f "$GFF3_GZ"
fi

# --- Step 3: Convert GFF3 → genePred using gff3ToGenePred ------------------

echo ""
echo "Step 3/6: Converting GFF3 → genePred with gff3ToGenePred ..."
GENEPRED_FILE="$GENOMES_DIR/${STEM}.genePred"
gff3ToGenePred -warnAndContinue "$GFF3_PLAIN" "$GENEPRED_FILE"

NLINES=$(wc -l < "$GENEPRED_FILE" | tr -d ' ')
echo "  Produced $NLINES genePred records."

# --- Step 4: Convert genePred → bigGenePred ---------------------------------

echo ""
echo "Step 4/6: Converting genePred → bigGenePred with genePredToBigGenePred ..."
BIGGENEPRED_FILE="$GENOMES_DIR/${STEM}.bigGenePred"
genePredToBigGenePred "$GENEPRED_FILE" "$BIGGENEPRED_FILE"

# --- Step 5: Sort the bigGenePred file --------------------------------------

echo ""
echo "Step 5/6: Sorting bigGenePred by chromosome and position ..."
SORTED_BIGGENEPRED="$GENOMES_DIR/${STEM}.sorted.bigGenePred"
sort -k1,1 -k2,2n "$BIGGENEPRED_FILE" > "$SORTED_BIGGENEPRED"

# --- Step 6: Convert sorted bigGenePred → BigBed ----------------------------

echo ""
echo "Step 6/6: Converting to BigBed with bedToBigBed ..."
BB_FILE="$GENOMES_DIR/${STEM}.bb"

# Download the bigGenePred AutoSQL schema if not already present
AS_FILE="$GENOMES_DIR/bigGenePred.as"
if [ ! -f "$AS_FILE" ]; then
    echo "  Downloading bigGenePred.as AutoSQL schema ..."
    curl -# -L -o "$AS_FILE" \
        "https://genome.ucsc.edu/goldenPath/help/examples/bigGenePred.as"
fi

# bedToBigBed with bed12+8 type and AutoSQL schema for the 8 extra genePred columns
bedToBigBed -type=bed12+8 -tab "$SORTED_BIGGENEPRED" "$CHROM_SIZES" "$BB_FILE" -as="$AS_FILE"

BB_SIZE=$(ls -lh "$BB_FILE" | awk '{print $5}')
echo "  BigBed file: $BB_FILE ($BB_SIZE)"

# --- Clean up intermediate files --------------------------------------------

rm -f "$GFF3_PLAIN" "$FAI_FILE" "$GENEPRED_FILE" "$BIGGENEPRED_FILE" "$SORTED_BIGGENEPRED"
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
