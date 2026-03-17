#!/bin/bash
# Index a GFF3 file for tabix random access.
#
# Usage:
#   ./scripts/index-gff3.sh <input.gff3.gz or input.gff3>
#
# Produces two files alongside the input:
#   <name>.sorted.gff3.gz      — bgzip-compressed, sorted GFF3
#   <name>.sorted.gff3.gz.tbi  — tabix index
#
# Prerequisites:
#   brew install htslib

set -e

if [ $# -ne 1 ]; then
    echo "Usage: $0 <input.gff3.gz or input.gff3>"
    exit 1
fi

INPUT="$1"

# Check prerequisites
for cmd in bgzip tabix; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: '$cmd' not found. Install with: brew install htslib"
        exit 1
    fi
done

# Determine input state and set up file paths
DIR="$(dirname "$INPUT")"
BASENAME="$(basename "$INPUT")"

if [[ "$BASENAME" == *.gff3.gz ]]; then
    STEM="${BASENAME%.gff3.gz}"
    GFF3_FILE="$DIR/${STEM}.gff3"
    echo "Step 1/4: Decompressing $BASENAME ..."
    gunzip -k "$INPUT"
elif [[ "$BASENAME" == *.gff3 ]]; then
    STEM="${BASENAME%.gff3}"
    GFF3_FILE="$INPUT"
    echo "Step 1/4: Input is already decompressed."
else
    echo "Error: Input must be a .gff3 or .gff3.gz file"
    exit 1
fi

OUTPUT_GZ="$DIR/${STEM}.sorted.gff3.gz"
OUTPUT_TBI="$OUTPUT_GZ.tbi"

# Sort by chromosome (col 1) then start position (col 4, numeric)
echo "Step 2/4: Sorting by chromosome and position ..."
(grep "^#" "$GFF3_FILE"; grep -v "^#" "$GFF3_FILE" | sort -t$'\t' -k1,1 -k4,4n) > "$DIR/${STEM}.sorted.gff3"

# Compress with bgzip
echo "Step 3/4: Compressing with bgzip ..."
bgzip "$DIR/${STEM}.sorted.gff3"

# Create tabix index
echo "Step 4/4: Creating tabix index ..."
tabix -p gff "$OUTPUT_GZ"

# Clean up decompressed file if we created it
if [[ "$BASENAME" == *.gff3.gz ]]; then
    rm -f "$GFF3_FILE"
fi

echo ""
echo "Done! Output files:"
echo "  $OUTPUT_GZ"
echo "  $OUTPUT_TBI"
echo ""
echo "Output files ready for use:"
echo "  url: $(basename "$OUTPUT_GZ")"
echo "  indexURL: $(basename "$OUTPUT_TBI")"
