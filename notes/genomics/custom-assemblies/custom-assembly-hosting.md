# Custom Assembly Hosting — 12 Assembly Subset

## Overview

Current hosting for the 12 HPRC custom assemblies (6 samples × 2 haplotypes):

| Data | Host | URL pattern |
|------|------|-------------|
| FASTA + `.fai` index | HPRC public S3 (CORS enabled) | `human-pangenomics.s3.amazonaws.com/working/HPRC/...` |
| Annotations (BigBed, self-indexed) | PGB-owned S3 bucket | `pgb-bigbed.s3.amazonaws.com/<assembly>_cat_v1.1_bigGenePred.bb` |
| Sorted GFF3 (pipeline input only) | GitHub | `raw.githubusercontent.com/turner/hprc-annotations/main/gff3/...` |

Both app-facing resources are direct S3 HTTPS with CORS and `Accept-Ranges: bytes`; no proxy server, no Cloudflare Worker, no localhost dependency.

## Why BigBed

BigBed replaces the older tabix-indexed GFF3 approach for annotation hosting:

- **One file per track.** The R-tree spatial index is embedded in the `.bb` file — no separate `.tbi` to host, upload, or keep in sync.
- **Pure static hosting.** IGV.js uses HTTP Range requests directly; no server-side preprocessing needed.
- **Matches HPRC's direction.** The HPRC collaboration team plans to distribute annotations as BigBed, so moving PGB to BigBed now aligns the app with that track format.

GFF3 + tabix on GitHub worked, but it required two files per track (~66 MB + ~300 KB), and GitHub was always a stopgap — it is not a data-hosting service and the 100 MB per-file limit would have bitten us at scale.

## Samples

6 samples, each with haplotype 1 (`#1`) and haplotype 2 (`#2`): HG00097, HG00099, HG00126, HG00128, HG00133, HG00140. The `#1`/`#2` ID convention is registry-wide; the full 462-entry source of truth lives in `data/custom-assemblies.json`.

## Registry File

`public/custom-assemblies/custom-assemblies-12-s3-cors-enabled-bigGenePred-s3.json`

This is the file the running app loads. Each entry looks like:

```json
{
  "id": "HG00097#1",
  "name": "HG00097_hap1_hprc_r2_v1.0.1",
  "fastaURL": "https://human-pangenomics.s3.amazonaws.com/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz",
  "indexURL": "https://human-pangenomics.s3.amazonaws.com/working/HPRC/HG00097/assemblies/release2/HG00097_hap1_hprc_r2_v1.0.1.fa.gz.fai",
  "tracks": [
    {
      "name": "Gene annotations",
      "url": "https://pgb-bigbed.s3.amazonaws.com/HG00097_hap1_hprc_r2_v1.0.1_cat_v1.1_bigGenePred.bb",
      "format": "bigbed"
    }
  ]
}
```

Note the track entry has **no `indexURL`** — BigBed is self-indexed.

## App Wiring

`src/appConfig.js` points to the registry:

```js
const appConfig = {
    customAssemblyRegistryURL: '/custom-assemblies/custom-assemblies-12-s3-cors-enabled-bigGenePred-s3.json',
    ...
}
```

Older variants are kept commented out in the same file as a log of the hosting evolution (localhost proxy → Cloudflare proxy → direct S3; GFF3+tabix → BigBed).

At startup, `src/main.js` fetches this URL, passes the array to `setCustomGenomes()`, and the assemblies appear alongside the standard hg38 genome.

## GFF3 → BigBed Pipeline

Raw GFF3 files are regular-gzipped and unsorted on HPRC's S3 bucket. The pipeline ends at a self-indexed BigBed file in `s3://pgb-bigbed`:

```
HPRC S3 (.gff3.gz, unsorted)
  → download + sort + bgzip + tabix          [scripts/batch-index-gff3.sh — one-time, pushed to turner/hprc-annotations]
  → download sorted GFF3 + .fai              [scripts/gff3-to-bigbed.sh]
  → gff3ToGenePred
  → genePredToBigGenePred
  → sort -k1,1 -k2,2n
  → bedToBigBed -type=bed12+8 (AutoSQL: bigGenePred.as)
  → upload .bb to s3://pgb-bigbed            [scripts/batch-gff3-to-bigbed.sh]
```

### Scripts

- **`scripts/gff3-to-bigbed.sh <gff3-url> <fai-url>`** — converts one assembly. Reads the sorted GFF3 from GitHub, pulls chrom sizes from the `.fai` on HPRC S3, runs the UCSC tool chain, leaves `data/genomes/<stem>.bb` on disk. Optional `--assembly-json` flag emits a PGB-compatible single-assembly config.
- **`scripts/batch-gff3-to-bigbed.sh`** — runs the single-assembly script for every entry in `custom-assemblies-12-s3-cors-enabled.json`, renames each output to `<stem>_bigGenePred.bb`, and uploads to `s3://pgb-bigbed`. This is what produced the 12 BigBed files currently in the bucket.

### Prerequisites

```
conda create -n bigbed -y --override-channels -c bioconda -c conda-forge \
    ucsc-gff3togenepred ucsc-genepredtobiggenepred ucsc-bedtobigbed
conda activate bigbed
```

Plus `aws` CLI configured for write access to `s3://pgb-bigbed`.

UCSC binaries can also be downloaded directly from `https://hgdownload.soe.ucsc.edu/admin/exe/macOSX.arm64/`.

## Role of GitHub Now

`turner/hprc-annotations` still holds the 12 sorted, bgzipped, tabix-indexed GFF3 files. The app no longer reads them. They remain useful as:

- A stable, versioned upstream for `gff3-to-bigbed.sh` (saves re-downloading and re-sorting 66 MB GFF3s from HPRC S3 each time)
- A reference set if tabix-indexed GFF3 is ever needed again

No new files are expected to be pushed there.

## Scaling Considerations

The 12-assembly BigBed set is ~tens of MB per file on `s3://pgb-bigbed` — cheap. Scaling to all 462 assemblies is now primarily an S3 cost / ingest-pipeline-runtime problem, not a hosting-architecture problem:

- Storage: linear with assembly count, no repo size ceiling.
- Ingest: `batch-gff3-to-bigbed.sh` is serial; parallelizing or moving it to a cloud runner becomes worthwhile before running all 462.
- Upstream sorted GFF3: scaling past ~30 assemblies means the GitHub staging repo stops being a good fit — either sort on the fly from HPRC S3, or stage in its own bucket.

## File Naming Convention

The registry filename encodes the configuration:

```
custom-assemblies-12-s3-cors-enabled-bigGenePred-s3.json
                  │   │                │              │
                  │   │                │              └── annotations on PGB's S3 bucket
                  │   │                └── bigGenePred-flavored BigBed (bed12+8)
                  │   └── FASTA served from HPRC S3 with CORS enabled (no proxy)
                  └── 12 assemblies (6 samples × 2 haplotypes)
```

Previous iterations kept in `public/custom-assemblies/` for reference:

- `custom-assemblies-12.json` — FASTA via localhost proxy, annotations via R2
- `custom-assemblies-12-cloudflare-proxy.json` — FASTA via Cloudflare Worker, annotations via R2
- `custom-assemblies-12-cloudflare-proxy-github-annotation-haplotype.json` — FASTA via Cloudflare Worker, annotations as GFF3+tabix on GitHub
- `custom-assemblies-12-s3-cors-enabled.json` — FASTA direct from HPRC S3, annotations as GFF3+tabix on GitHub (input to the BigBed batch script)
- `custom-assemblies-12-s3-cors-enabled-bigbed.json` — BigBed served from the local proxy server at `localhost:8000`
- `custom-assemblies-12-s3-cors-enabled-bigGenePred-s3.json` — **current**: BigBed from `s3://pgb-bigbed`
