# GitHub-Hosted Annotation Tracks — 12 Assembly Subset

## Overview

This document describes the current hosting arrangement for 12 HPRC custom assemblies (6 samples x 2 haplotypes). It replaces the earlier Cloudflare R2 approach for annotation hosting with GitHub, while keeping FASTA files on Cloudflare.

| Data | Host | URL pattern |
|------|------|-------------|
| FASTA + index | Cloudflare Workers S3 proxy | `pgb-custom-assemblies-s3-proxy.aidenlab.workers.dev/human-pangenomics/...` |
| GFF3 annotations + tabix index | GitHub | `raw.githubusercontent.com/turner/hprc-annotations/main/gff3/...` |

## Why GitHub?

Cloudflare R2 was the initial solution for hosting sorted/indexed GFF3 files, but it relies on borrowed storage from another project. GitHub is a permanent, free alternative. The key technical requirement — HTTP Range request support — was verified:

- `raw.githubusercontent.com` returns `206 Partial Content` for Range requests
- CORS headers (`Access-Control-Allow-Origin: *`) are included
- `Accept-Ranges: bytes` is advertised

Since tabix fetches only the compressed blocks covering the requested genomic region (typically a few hundred KB), the ~66MB file size is not a bandwidth concern. GitHub's per-file limit is 100MB (with warnings above 50MB), so the files are accepted.

## Samples

6 samples, each with haplotype 1 (`#1`) and haplotype 2 (`#2`):

| Sample | Haplotype 1 ID | Haplotype 2 ID |
|--------|----------------|----------------|
| HG00097 | HG00097#1 | HG00097#2 |
| HG00099 | HG00099#1 | HG00099#2 |
| HG00126 | HG00126#1 | HG00126#2 |
| HG00128 | HG00128#1 | HG00128#2 |
| HG00133 | HG00133#1 | HG00133#2 |
| HG00140 | HG00140#1 | HG00140#2 |

The `#1`/`#2` ID convention comes from `data/custom-assemblies.json`, the single source of truth for custom assembly registry keys.

## File Inventory

The GitHub repo `turner/hprc-annotations` contains 24 files under `gff3/`:

For each assembly (e.g. `HG00097_hap1_hprc_r2_v1.0.1`):
- `HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz` — sorted, bgzip-compressed GFF3 (~66MB)
- `HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz.tbi` — tabix index (~300KB)

## Registry File

`data/custom-assemblies-12-cloudflare-proxy-github-annotation-haplotype.json`

This is the registry loaded by the app at startup. Each entry follows this structure:

```json
{
  "id": "HG00097#1",
  "name": "HG00097_hap1_hprc_r2_v1.0.1",
  "fastaURL": "https://pgb-custom-assemblies-s3-proxy.aidenlab.workers.dev/human-pangenomics/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz",
  "indexURL": "https://pgb-custom-assemblies-s3-proxy.aidenlab.workers.dev/human-pangenomics/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai",
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

A copy also lives in `public/` where the dev server can serve it.

## App Wiring

`src/appConfig.js` points to the registry:

```js
const appConfig = {
    customAssemblyRegistryURL: '/custom-assemblies-12-cloudflare-proxy-github-annotation-haplotype.json',
    ...
}
```

At startup, `src/main.js` fetches this URL, passes the array to `setCustomGenomes()`, and the assemblies appear alongside the standard hg38 genome.

## GFF3 Indexing Pipeline

Raw GFF3 files on HPRC's S3 bucket are regular-gzipped and unsorted — unusable for random-access queries. The pipeline produces files suitable for tabix:

```
S3 (.gff3.gz) → download → gunzip → sort by chr+pos → bgzip → tabix index
```

The script `scripts/batch-index-and-upload-github.sh` automates this for all 12 assemblies:

1. Downloads each `.gff3.gz` from `human-pangenomics.s3.us-west-2.amazonaws.com`
2. Decompresses with `gunzip`
3. Sorts by chromosome (col 1) then start position (col 4, numeric), preserving `#` header lines
4. Recompresses with `bgzip` (block gzip — enables random access)
5. Creates tabix index with `tabix -p gff`
6. Commits both files to the local clone of `turner/hprc-annotations`
7. Pushes all commits to GitHub after processing is complete

Prerequisites: `brew install htslib` (provides `bgzip` and `tabix`).

## Scaling Considerations

This 12-assembly subset uses ~800MB of GitHub storage. The full 462-assembly set would require ~30GB, which exceeds GitHub's recommended repo size. Options for scaling:

- Split across multiple GitHub repos (e.g. by sample ID range)
- Use GitHub LFS (paid storage beyond 1GB free tier)
- Use GitHub Releases (2GB per asset, no repo size impact)
- Return to dedicated object storage (R2, S3) when a permanent bucket is available

## Naming Convention

The registry filename encodes the configuration:

```
custom-assemblies-12-cloudflare-proxy-github-annotation-haplotype.json
                  │   │                │                  │
                  │   │                │                  └── includes both haplotypes
                  │   │                └── annotations hosted on GitHub
                  │   └── FASTA proxied through Cloudflare Workers
                  └── 12 assemblies (6 samples x 2 haplotypes)
```

Previous iterations:
- `custom-assemblies-12.json` — FASTA via localhost proxy, annotations via R2
- `custom-assemblies-12-cloudflare-proxy.json` — FASTA via Cloudflare proxy, annotations via R2
- `custom-assemblies.json` — full 462-entry source of truth (placeholder annotation URLs)
