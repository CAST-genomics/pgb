# Creating Indexed Genome Files for PGB

## Overview

PGB supports HTTP range requests for both FASTA sequence files and GFF3 annotation files. This eliminates the need to download entire files (often hundreds of MB to several GB) — instead, only the small slice of data visible in the current browser view is fetched. This document describes how to prepare the indexed files that make this possible.

There are two types of indexed files:

1. **Indexed FASTA** — uncompressed `.fa` file + `.fai` index for sequence data
2. **Tabix-indexed GFF3** — bgzip-compressed `.gff3.gz` file + `.tbi` index for gene annotations

## Prerequisites

### Required tools

```bash
# Install htslib (provides bgzip, tabix) and samtools (provides samtools faidx)
brew install htslib samtools
```

Verify installation:

```bash
bgzip --version    # should print htslib version
tabix --version    # should print htslib version
samtools --version # should print samtools version
```

### Source files

You need the raw genome files, typically downloaded from HPRC or another genome project:

| File | Typical size | Description |
|------|-------------|-------------|
| `*.fa.gz` or `*.fa` | 900MB–3GB | FASTA sequence (compressed or uncompressed) |
| `*.gff3.gz` or `*.gff3` | 50–200MB | GFF3 gene annotations (compressed or uncompressed) |

---

## Part 1: Creating an Indexed FASTA

### Background

A FASTA index (`.fai`) is a small text file that maps each chromosome/contig name to its byte offset, length, and line layout within the FASTA file. This allows the browser to calculate exactly which bytes to request for any genomic coordinate range.

**Important**: PGB's `IndexedFasta` currently supports **uncompressed FASTA only**. If your source file is compressed (`.fa.gz`), you must decompress it first. Compressed FASTA with `.gzi` index support may be added in the future.

### Step 1: Decompress the FASTA (if compressed)

If your file is `.fa.gz`:

```bash
gunzip -k HG00099_hap1_hprc_r2_v1.0.1.fa.gz
```

The `-k` flag keeps the original `.gz` file. This produces a large uncompressed file (e.g., 2.9GB for HG00099).

If your file is already `.fa`, skip this step.

### Step 2: Create the FASTA index

```bash
samtools faidx HG00099_hap1_hprc_r2_v1.0.1.fa
```

This creates `HG00099_hap1_hprc_r2_v1.0.1.fa.fai` — a small text file (typically 2–10KB).

**Alternative**: If the genome project already provides a `.fai` file for the compressed FASTA (e.g., `.fa.gz.fai`), you can often reuse it directly:

```bash
cp HG00099_hap1_hprc_r2_v1.0.1.fa.gz.fai HG00099_hap1_hprc_r2_v1.0.1.fa.fai
```

This works because `.fai` byte offsets reference the uncompressed content, which is the same whether the file was originally compressed or not. However, if in doubt, regenerate with `samtools faidx` to be safe.

### Step 3: Verify the index

Inspect the first few lines of the `.fai` file:

```bash
head -3 HG00099_hap1_hprc_r2_v1.0.1.fa.fai
```

Expected format (5 tab-separated columns):

```
HG00099#1#CM087317.1    242530879    22    60    61
HG00099#1#CM087318.1    181236516    246573105    60    61
HG00099#1#CM087319.1    160818139    430830252    60    61
```

| Column | Meaning |
|--------|---------|
| 1 | Chromosome/contig name |
| 2 | Sequence length (bases) |
| 3 | Byte offset of first base in the FASTA file |
| 4 | Bases per line (excluding line ending) |
| 5 | Bytes per line (including line ending, typically basesPerLine + 1) |

### Output files

```
HG00099_hap1_hprc_r2_v1.0.1.fa       — uncompressed FASTA (~2.9GB)
HG00099_hap1_hprc_r2_v1.0.1.fa.fai   — FASTA index (~6KB)
```

### How it works at runtime

When PGB needs sequence for a region (e.g., `chr1:1000-2000`):

1. Fetches the `.fai` index (cached after first fetch)
2. Looks up the chromosome's byte offset, bases-per-line, and bytes-per-line
3. Calculates the exact byte range: accounts for line endings in the FASTA format
4. Fetches only those bytes via an HTTP `Range` request
5. Strips line endings from the returned data to produce the clean sequence string

For a typical 1KB region, this fetches ~1KB of data instead of 2.9GB.

---

## Part 2: Creating a Tabix-Indexed GFF3

### Background

Tabix indexing requires two things:
1. The file must be compressed with **bgzip** (block gzip), which writes data in independently decompressible ~64KB blocks. This is distinct from regular gzip.
2. The file must be **sorted** by chromosome then by start position.

The tabix index (`.tbi`) maps genomic coordinate ranges to byte offset ranges in the bgzip file. At runtime, only the blocks covering the requested region are fetched and decompressed.

### Step 1: Decompress (if gzip-compressed)

Regular gzip cannot be randomly accessed. We must decompress, then recompress with bgzip.

```bash
gunzip HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz
```

This removes the original `.gz` and produces the raw `.gff3` file (several hundred MB).

If your file is already uncompressed `.gff3`, skip this step.

### Step 2: Sort by chromosome and position

Tabix requires the file to be sorted by chromosome (column 1) then by start position (column 4, numeric). GFF3 header/comment lines (starting with `#`) must be preserved at the top.

```bash
(grep "^#" file.gff3; grep -v "^#" file.gff3 | sort -t$'\t' -k1,1 -k4,4n) > file.sorted.gff3
```

Breaking this down:

| Part | Purpose |
|------|---------|
| `grep "^#" file.gff3` | Extract header/comment lines (already at top) |
| `grep -v "^#" file.gff3` | Extract data lines only |
| `sort -t$'\t' -k1,1 -k4,4n` | Sort by column 1 (chromosome, lexicographic) then column 4 (start position, numeric) |
| `> file.sorted.gff3` | Write to a new sorted file |

### Step 3: Compress with bgzip

```bash
bgzip file.sorted.gff3
```

This replaces the file with `file.sorted.gff3.gz`. Unlike regular gzip, bgzip writes data in ~64KB blocks, each independently decompressible. The file is still a valid gzip file (browsers and HTTP servers handle it normally), but it has internal block boundaries enabling random access.

**Alternatively**, combine steps 2 and 3 with piping:

```bash
(grep "^#" file.gff3; grep -v "^#" file.gff3 | sort -t$'\t' -k1,1 -k4,4n) | bgzip > file.sorted.gff3.gz
```

### Step 4: Create the tabix index

```bash
tabix -p gff file.sorted.gff3.gz
```

The `-p gff` preset tells tabix the GFF column layout:

| Column | Meaning |
|--------|---------|
| 1 | Sequence name (chromosome/contig) |
| 4 | Start position |
| 5 | End position |

This produces `file.sorted.gff3.gz.tbi` — a small binary index file (typically 100–500KB).

### Step 5: Verify

```bash
# Check that the index was created
ls -la file.sorted.gff3.gz.tbi

# Test a region query
tabix file.sorted.gff3.gz HG00099#1#CM087317.1:1000000-1001000
```

The `tabix` query command should return GFF3 lines for features in that region. If it returns nothing, the region may have no features — try a different coordinate range.

### Output files

```
file.sorted.gff3.gz       — bgzip-compressed, sorted GFF3 (similar size to original .gz)
file.sorted.gff3.gz.tbi   — tabix index (~100–500KB)
```

### How it works at runtime

When PGB needs gene annotations for a region (e.g., `chr1:1M-2M`):

1. Fetches the `.tbi` index (cached after first fetch)
2. Looks up the chromosome in the index's `sequenceIndexMap`
3. Calls `chunksForRange()` which uses the binning scheme (same as BAM) to find which compressed blocks overlap the query
4. Fetches only those compressed blocks via HTTP `Range` requests
5. Decompresses each block with `BGZip.inflateRaw()`
6. Parses the GFF3 features and filters to the requested range

For a typical 1MB region, this fetches a few hundred KB instead of 64MB.

---

## Part 3: Automation Script

The script `scripts/index-gff3.sh` automates the GFF3 indexing workflow (Part 2):

```bash
./scripts/index-gff3.sh ~/Downloads/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.gff3.gz
```

It handles: checking for htslib, decompressing if needed, sorting, bgzip compression, and tabix index creation. Output files are written alongside the input.

For FASTA indexing (Part 1), the steps are simple enough that a script isn't necessary:

```bash
gunzip -k mygenome.fa.gz        # decompress (keep original)
samtools faidx mygenome.fa       # create .fai index
```

---

## Part 4: Configuring PGB to Use Indexed Files

### Genome config JSON

Both the FASTA index URL and the GFF3 tabix index URL go into the genome config:

```json
[
  {
    "id": "HG00099",
    "name": "HG00099 test file (Cici) - local",
    "fastaURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1.fa",
    "indexURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1.fa.fai",
    "tracks": [
      {
        "name": "Gene annotations",
        "url": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz",
        "indexURL": "http://localhost:8000/data/genomes/HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz.tbi",
        "format": "gff3"
      }
    ]
  }
]
```

Key points:
- **Top-level `indexURL`**: Points to the `.fai` FASTA index. When present, PGB creates an `IndexedFasta` instead of loading the entire FASTA into memory.
- **Track-level `indexURL`**: Points to the `.tbi` tabix index. When present, `FeatureFileReader` uses `loadFeaturesWithIndex()` for range-based queries.
- **`format: "gff3"`**: Required so PGB uses the GFF3 parser (not the default refGene parser).

### Code path

The presence of `indexURL` controls the code path automatically:

```
loadSequence(reference)
  ├── reference.indexURL present  →  IndexedFasta (range requests via .fai)
  └── reference.indexURL absent   →  NonIndexedFasta (loads entire file)

FeatureFileReader.readFeatures(chr, start, end)
  ├── config.indexURL present  →  loadFeaturesWithIndex() (range requests via .tbi)
  └── config.indexURL absent   →  loadFeaturesNoIndex() (loads entire file)
```

---

## Part 5: Performance Comparison

| Metric | Without indexing | With indexing |
|--------|-----------------|---------------|
| FASTA load | Full download (~2.9GB) | Range request (~1-10KB per view) |
| GFF3 load | Full download + parse (~64MB, 63 sec) | Range request (~50-500KB, milliseconds) |
| Initial index fetch | N/A | One-time ~500KB (cached) |
| User experience | Unusable lag on genome selection | Feels real-time |

---

## Troubleshooting

### "Features not loading" or empty annotation track

1. Verify the GFF3 is sorted: `tabix -l file.sorted.gff3.gz` should list chromosome names
2. Check that chromosome names in the GFF3 match the FASTA: compare `head -1 file.fa.fai` with `tabix -l file.sorted.gff3.gz`
3. Ensure the `.tbi` file is served with correct CORS headers if using a separate data server

### "No sequence data" for a chromosome

1. Check the `.fai` file contains the chromosome: `grep "chrName" file.fa.fai`
2. Verify the FASTA is uncompressed (not `.fa.gz`) — PGB doesn't yet support compressed FASTA with `.gzi`
3. Ensure the data server supports HTTP `Range` requests (Python's `http.server` does by default)

### CORS errors when fetching from localhost:8000

The data server must send `Access-Control-Allow-Origin: *` headers. The provided `scripts/run-local-server.sh` handles this automatically.

### bgzip vs gzip confusion

A common mistake is using regular `gzip` instead of `bgzip`. Regular gzip files cannot be tabix-indexed because they lack the block boundaries needed for random access. If `tabix` fails with an error about the file not being bgzip-compressed, recompress with `bgzip`.

To check if a file is bgzip-compressed:

```bash
# bgzip files have a specific extra field in the gzip header
# This will show "BC" in the extra field for bgzip files
hexdump -C file.gz | head -2
```

A bgzip file will have bytes `42 43` (ASCII "BC") near the start of the header.

## References

- [samtools faidx documentation](http://www.htslib.org/doc/samtools-faidx.html)
- [tabix documentation](http://www.htslib.org/doc/tabix.html)
- [bgzip documentation](http://www.htslib.org/doc/bgzip.html)
- [htslib GitHub](https://github.com/samtools/htslib)
- [The FASTA index format (.fai) specification](https://www.htslib.org/doc/faidx.html)
