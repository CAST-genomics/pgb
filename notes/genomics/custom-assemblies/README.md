# HPRC Custom Assemblies — Data Architecture

## Overview

PGB supports custom genome assemblies from the Human Pangenome Reference Consortium (HPRC) Release 2. Each assembly consists of two data types that are hosted separately:

| Data | What it is | Where it lives | How it's accessed |
|------|-----------|----------------|-------------------|
| **FASTA + index** | Genome sequence (.fa.gz, .fa.gz.fai) | HPRC's S3 bucket (`human-pangenomics`) | Local CORS proxy (`localhost:8000`) |
| **GFF3 annotations + tabix index** | Gene annotations (.sorted.gff3.gz, .tbi) | **Cloudflare R2** (`hprc-genomes` bucket) | Direct public URL |

## Cloudflare R2 Setup

- **Account**: Theaidenlab@gmail.com (`1eadb18bb8557fd1bd06b1d0310a902e`)
- **Bucket**: `hprc-genomes`
- **Public URL**: `https://pub-f01aebfa997342239ff267859037de0f.r2.dev`
- **Object prefix**: `gff3/` (e.g. `.../gff3/HG00408_pat_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz`)
- **CORS**: Configured to allow `*` origins, `GET`/`HEAD` methods, `Range` header (required by igv.js)
- **Cost**: Free tier — zero egress fees, 10GB storage, 10M reads/month

### Why R2?

The raw GFF3 files on HPRC's S3 are unsorted and regular-gzipped — unusable for random-access queries. We sort, bgzip-compress, and tabix-index them, producing derived files that we host ourselves. R2 was chosen because it natively supports CORS and Range requests, eliminating the need for the local proxy server for annotation data.

## Source Data

462 HPRC assemblies with matched annotations, derived from two CSVs in the [hprc_intermediate_assembly](https://github.com/human-pangenomics/hprc_intermediate_assembly) repo:

- **Assemblies**: `assemblies_release2_v1.0.index.csv` (466 rows, 6 unmatched reference genomes excluded)
- **Annotations**: `cat_genes_hprc_r2_v1.2.index.csv` (462 GFF3 files on S3)

## Key Files in the PGB Project

### Configuration
- `public/custom-assemblies-12.json` — Active custom genome registry (12 assemblies). Loaded by the app at startup via `fetch()`, passed to `setCustomGenomes()`.
- `notes/genomics/hprc-assembly-and-annotation-files/assembly-registry.json` — Full 462-entry registry (reference copy, not loaded by the app directly).

### Scripts
- `scripts/batch-index-and-upload-r2.sh` — Downloads GFF3 from S3, sorts, bgzips, tabix-indexes, uploads to R2, updates the registry. Supports `--first-n N` and `--entry N` flags. Skips entries already on R2.
- `scripts/run-local-s3-proxy-server.sh` — Local Python server (port 8000) that proxies FASTA requests to S3 with CORS headers and Range support. Still required for FASTA files.
- `scripts/batch-index-gff3.sh` — Original local-only indexing script (predecessor to the R2 version).
- `scripts/index-gff3.sh` — Indexes a single local GFF3 file.

### App Code
- `src/main.js` — Fetches `custom-assemblies-12.json`, calls `setCustomGenomes()`, initializes the genome registry.
- `src/igvCore/genome/genomeRegistry.js` — Facade over igv.org + custom genome sources. `setCustomGenomes(array)` accepts parsed genome configs directly.
- `src/igvCore/genome/customRegistrySource.js` — Builds a Map from an array of genome config objects (no network fetch).

## GFF3 Indexing Pipeline

Raw GFF3 on S3 → download → gunzip → sort by chr+pos → bgzip → tabix index → upload to R2

Each assembly produces two files on R2:
- `.sorted.gff3.gz` (~66MB) — block-gzip compressed, randomly accessible
- `.sorted.gff3.gz.tbi` (~300KB) — tabix index mapping genomic coordinates to byte offsets

## Current State (March 2026)

- **12 of 462** assemblies fully indexed and hosted on R2
- GFF3 annotation tracks load directly from Cloudflare — no proxy needed
- FASTA files still served via the local S3 proxy (moving these to R2 would eliminate the proxy entirely)
- To process remaining assemblies: `./scripts/batch-index-and-upload-r2.sh`

## Running the App

1. Start the local proxy (needed for FASTA files): `./scripts/run-local-s3-proxy-server.sh`
2. Start the dev server: `npm run dev`
3. The 12 custom assemblies are available alongside the standard hg38 genome
