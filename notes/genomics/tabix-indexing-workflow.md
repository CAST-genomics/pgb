# Tabix Indexing Workflow for GFF3 Annotation Files

## Problem

Custom genome GFF3 annotation files (e.g., HG00099 at ~64MB compressed) are too large to download and parse in their entirety when the browser only needs features for a small genomic region. Loading the full file takes ~63 seconds, which is unusable.

## Solution

Create a **tabix index** (`.tbi`) for the GFF3 file. This enables HTTP range requests — the browser fetches only the compressed blocks covering the requested region instead of the entire file.

### How tabix works

1. The GFF3 file is compressed with **bgzip** (block gzip), which writes data in independently decompressible 64KB blocks. This is distinct from regular gzip, which cannot be randomly accessed.

2. The **tabix index** (`.tbi`) is a small file that maps genomic coordinates to byte offsets in the bgzip file. For example, it knows that features on `chr6:160M-161M` are stored in blocks at bytes 5,200,000-5,250,000.

3. When the browser needs features for a region, it:
   - Fetches the `.tbi` index (small, cached after first fetch)
   - Looks up which compressed blocks contain the requested region
   - Fetches only those blocks via HTTP `Range` requests
   - Decompresses and parses just those blocks

Instead of downloading 64MB, a typical region query downloads a few hundred KB.

## Prerequisites

Install htslib (provides `bgzip` and `tabix`):

```bash
brew install htslib
```

## Workflow

### Input

A gzip-compressed GFF3 file, e.g.:
```
~/Downloads/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz  (~64MB)
```

### Step 1: Decompress

Regular gzip compression does not support random access. We need to decompress first, then recompress with bgzip.

```bash
gunzip HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz
```

This produces the raw text file (several hundred MB uncompressed). The original `.gz` file is removed by gunzip.

### Step 2: Sort by chromosome and position

Tabix requires the file to be sorted by chromosome (column 1) then by start position (column 4, numeric). GFF3 header lines (starting with `#`) must be preserved at the top.

```bash
(grep "^#" file.gff3; grep -v "^#" file.gff3 | sort -t$'\t' -k1,1 -k4,4n)
```

- `grep "^#"` — extracts header/comment lines
- `grep -v "^#"` — extracts data lines
- `sort -t$'\t' -k1,1 -k4,4n` — sorts data by column 1 (chromosome, lexicographic) then column 4 (start position, numeric)

### Step 3: Recompress with bgzip

Pipe the sorted output through bgzip:

```bash
(grep "^#" file.gff3; grep -v "^#" file.gff3 | sort -t$'\t' -k1,1 -k4,4n) | bgzip > file.gff3.gz
```

The resulting `.gz` file is the same format that browsers and HTTP servers understand (bgzip is gzip-compatible), but it has internal block boundaries that enable random access.

### Step 4: Create the tabix index

```bash
tabix -p gff file.gff3.gz
```

The `-p gff` preset tells tabix the GFF column layout:
- Column 1: chromosome/sequence name
- Column 4: start position
- Column 5: end position

This produces `file.gff3.gz.tbi` — a small index file (typically a few hundred KB).

### Output

Two files:
```
file.gff3.gz      — bgzip-compressed, sorted GFF3 (similar size to original)
file.gff3.gz.tbi  — tabix index (small)
```

## Automation

The script `scripts/index-gff3.sh` automates this entire workflow:

```bash
./scripts/index-gff3.sh ~/Downloads/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz
```

It checks for htslib, decompresses if needed, sorts, recompresses with bgzip, and creates the tabix index. The output files are written alongside the input file.

## Updating the genome config

Once indexed, update `data/test-local.json` to remove `"indexed": false` (or set it to `true`):

```json
{
  "tracks": [
    {
      "name": "Gene annotations",
      "url": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz",
      "indexURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz.tbi",
      "format": "gff3"
    }
  ]
}
```

## References

- [tabix manual page](http://www.htslib.org/doc/tabix.html)
- [htslib GitHub](https://github.com/samtools/htslib)
- [bgzip manual page](http://www.htslib.org/doc/bgzip.html)
