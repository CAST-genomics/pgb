#!/bin/bash
# Link HG00099 genome files from Downloads into data/genomes/
# Run this once before starting the local data server.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/data/genomes"
DOWNLOADS="$HOME/Downloads"

mkdir -p "$DATA_DIR"

for f in \
  HG00099_hap1_hprc_r2_v1.0.1.fa \
  HG00099_hap1_hprc_r2_v1.0.1.fa.fai \
  HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz \
  HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz.tbi
do
  src="$DOWNLOADS/$f"
  dst="$DATA_DIR/$f"
  if [ -f "$src" ]; then
    ln -sf "$src" "$dst"
    echo "Linked: $f"
  else
    echo "Warning: $src not found (download the file first)"
  fi
done

echo ""
echo "Setup complete. Start the data server with: ./scripts/run-local-server.sh"
