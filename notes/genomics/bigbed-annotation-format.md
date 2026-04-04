# BigBed Annotation Format for Custom Assemblies

## Motivation

PGB currently uses tabix-indexed GFF3 files for gene annotation tracks on custom HPRC assemblies. This works well but requires two files per assembly: a sorted, bgzip-compressed `.gff3.gz` and a separate `.tbi` tabix index. The sort-compress-index pipeline is non-trivial, and the HPRC collaboration team that hosts the 462 assemblies has indicated they are not interested in hosting sorted/indexed GFF3 files. Instead, they plan to provide annotation tracks in **BigBed** format.

This document describes the BigBed format, why it is a suitable replacement for tabix-indexed GFF3, and how we convert between the two for local testing.

## What is BigBed?

BigBed is a binary, self-indexed file format created by the UCSC Genome Browser team. It is the indexed counterpart to plain-text BED files, in the same way that BAM is the indexed counterpart to SAM.

### Key properties

| Property | BigBed (`.bb`) | Tabix-indexed GFF3 (`.gff3.gz` + `.tbi`) |
|----------|---------------|------------------------------------------|
| Files needed | 1 | 2 (data + index) |
| Index location | Embedded (R-tree inside the file) | Separate `.tbi` file |
| Random access | Yes (via embedded R-tree) | Yes (via tabix index) |
| HTTP Range requests | Yes | Yes |
| Preprocessing needed | One-time conversion with `bedToBigBed` | Sort + bgzip + tabix |
| IGV.js support | Native | Native |

### How the embedded index works

A BigBed file has three sections:

1. **Header** — file metadata, chromosome sizes, and a pointer to the R-tree index
2. **R-tree spatial index** — a hierarchical index mapping genomic coordinate ranges to byte offsets in the data section
3. **Compressed data blocks** — the actual BED records, compressed in chunks

When a client (e.g. IGV.js) needs annotations for a region:

1. It reads the header (a single small Range request, cached after first fetch)
2. It traverses the R-tree to find which data blocks overlap the query region
3. It fetches only those data blocks via targeted Range requests
4. It decompresses and parses the BED records

This is functionally equivalent to how tabix works with GFF3, but everything lives in one file.

### BED12 and gene structure

BigBed files are built from BED format, not GFF3. BED has a simpler flat structure — no parent/child hierarchy like GFF3's gene-transcript-exon nesting. However, **BED12** (12-column BED) preserves transcript structure using "blocks":

| Column | Name | Example | Purpose |
|--------|------|---------|---------|
| 1 | chrom | `HG00097#1#CM094060.1` | Chromosome/contig |
| 2 | chromStart | `12197` | Feature start (0-based) |
| 3 | chromEnd | `13460` | Feature end |
| 4 | name | `HG00097_hap1_T000001` | Transcript ID |
| 5 | score | `100` | Score (0-1000) |
| 6 | strand | `-` | Strand |
| 7 | thickStart | `12197` | CDS start (for coding genes) |
| 8 | thickEnd | `13460` | CDS end |
| 9 | itemRgb | `0,0,0` | Display color |
| 10 | blockCount | `3` | Number of exons |
| 11 | blockSizes | `220,75,508,` | Size of each exon |
| 12 | blockStarts | `0,1111,1323,` | Start of each exon (relative to chromStart) |

IGV.js renders BED12 blocks as the familiar thick/thin exon-intron gene models — visually indistinguishable from GFF3-based rendering for most purposes.

### What is lost in GFF3 to BED12 conversion?

- **Hierarchical relationships** — GFF3 encodes explicit gene-transcript-exon parent/child links; BED12 flattens to one record per transcript
- **Feature types** — GFF3 distinguishes mRNA, lncRNA, CDS, UTR, etc.; BED12 has only blocks
- **Attributes** — GFF3's key-value attributes (gene_id, gene_name, biotype) are not carried into standard BED12

For PGB's annotation display use case (showing gene models in IGV.js), BED12 provides sufficient information. The full GFF3 detail would only matter if we needed to query by feature type or access specific attributes programmatically.

## Conversion Pipeline

```
.gff3.gz  →  gunzip  →  gffread --bed  →  cut -f1-12  →  sort  →  bedToBigBed  →  .bb
```

### Step by step

1. **Download and decompress** the GFF3 annotation (typically `.gff3.gz` from HPRC S3)
2. **Download the FASTA index** (`.fa.gz.fai`) — needed to extract chromosome sizes, which `bedToBigBed` requires
3. **Convert GFF3 to BED12** using `gffread --bed` — this preserves exon block structure. gffread appends a 13th metadata column, which we strip with `cut -f1-12` to produce standard BED12
4. **Sort** by chromosome then position (`sort -k1,1 -k2,2n`)
5. **Convert to BigBed** with UCSC's `bedToBigBed -type=bed12`

### Prerequisites

```bash
# Create a conda environment with both tools
conda create -n bigbed -y --override-channels -c bioconda -c conda-forge gffread ucsc-bedtobigbed
conda activate bigbed
```

### Automation script

`scripts/gff3-to-bigbed.sh` automates the full pipeline:

```bash
# Basic conversion — produces .bb file in data/genomes/
./scripts/gff3-to-bigbed.sh <gff3-url> <fai-url>

# With PGB assembly JSON generation
./scripts/gff3-to-bigbed.sh <gff3-url> <fai-url> --assembly-json <existing-assembly.json>
```

Example for HG00097#1:

```bash
conda activate bigbed

./scripts/gff3-to-bigbed.sh \
  https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz \
  https://human-pangenomics.s3.amazonaws.com/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai \
  --assembly-json public/single-custom-assembly-s3-cors-enabled.json
```

This produces:
- `data/genomes/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.bb` (15MB)
- `public/single-custom-assembly-s3-cors-enabled-bigbed.json`

## PGB Assembly Config: GFF3 vs BigBed

### GFF3 version (two files, requires indexURL)

```json
{
  "id": "HG00097#1",
  "name": "HG00097_hap1_hprc_r2_v1.0.1",
  "fastaURL": "https://human-pangenomics.s3.amazonaws.com/.../HG00097_hap1_hprc_r2_v1.0.1.fa.gz",
  "indexURL": "https://human-pangenomics.s3.amazonaws.com/.../HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai",
  "tracks": [
    {
      "name": "Gene annotations",
      "url": "https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz",
      "indexURL": "https://raw.githubusercontent.com/turner/hprc-annotations/main/gff3/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz.tbi",
      "format": "gff3"
    }
  ]
}
```

### BigBed version (single file, no indexURL needed)

```json
{
  "id": "HG00097#1",
  "name": "HG00097_hap1_hprc_r2_v1.0.1",
  "fastaURL": "https://human-pangenomics.s3.amazonaws.com/.../HG00097_hap1_hprc_r2_v1.0.1.fa.gz",
  "indexURL": "https://human-pangenomics.s3.amazonaws.com/.../HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai",
  "tracks": [
    {
      "name": "Gene annotations (BigBed)",
      "url": "https://raw.githubusercontent.com/turner/hprc-annotations/main/bigbed/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.bb",
      "format": "bigbed"
    }
  ]
}
```

## Hosting

The test BigBed file is hosted alongside the existing GFF3 files in the `turner/hprc-annotations` GitHub repo:

| Format | Directory | Example URL |
|--------|-----------|-------------|
| GFF3 + tabix | `gff3/` | `raw.githubusercontent.com/turner/hprc-annotations/main/gff3/*.sorted.gff3.gz` |
| BigBed | `bigbed/` | `raw.githubusercontent.com/turner/hprc-annotations/main/bigbed/*.bb` |

GitHub's `raw.githubusercontent.com` supports Range requests and CORS, so BigBed works without any proxy. The 15MB file size is well within GitHub's 100MB per-file limit.

When the HPRC collaboration team provides their own BigBed URLs, the assembly configs will simply point to those URLs instead.

## Size Comparison

For the HG00097 haplotype 1 annotation:

| Format | Files | Total size |
|--------|-------|-----------|
| GFF3 + tabix | `.sorted.gff3.gz` (66MB) + `.tbi` (300KB) | ~66MB |
| BigBed | `.bb` (15MB) | 15MB |

BigBed is significantly smaller because BED12 is a more compact representation than GFF3 (fewer columns, no hierarchical nesting, no repeated attributes).

## References

- [UCSC BigBed format specification](https://genome.ucsc.edu/goldenPath/help/bigBed.html)
- [bedToBigBed documentation](https://genome.ucsc.edu/goldenPath/help/bigBed.html#Ex3)
- [gffread documentation](https://github.com/gpertea/gffread)
- [BED12 format](https://genome.ucsc.edu/FAQ/FAQformat.html#format1)
- [IGV.js BigBed support](https://github.com/igvteam/igv.js/wiki/Tracks-2.0#big-bed)
