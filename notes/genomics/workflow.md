# HPRC Assembly Registry Workflow

## Goal

Create a registry of HPRC Release 2 genome assemblies with matched gene annotation tracks, suitable for loading into IGV or PGB as custom genomes.

## Source Data

Two CSV files hosted on GitHub in the [hprc_intermediate_assembly](https://github.com/human-pangenomics/hprc_intermediate_assembly) repository:

- **Assemblies**: [assemblies_release2_v1.0.index.csv](https://github.com/human-pangenomics/hprc_intermediate_assembly/blob/main/data_tables/assemblies_release2_v1.0.index.csv)
  - Columns: `sample_id`, `haplotype`, `assembly_name`, `assembly`, `assembly_fai`, `assembly_gzi`, etc.
  - 466 rows. FASTA files hosted on S3 (`s3://human-pangenomics/...`)

- **Annotations**: [cat_genes_hprc_r2_v1.2.index.csv](https://github.com/human-pangenomics/hprc_intermediate_assembly/blob/main/data_tables/annotation/cat/cat_genes_hprc_r2_v1.2.index.csv)
  - Columns: `sample_id`, `haplotype`, `assembly_name`, `location`
  - 462 rows. GFF3 files hosted on S3.

## Joining Assemblies to Annotations

The `assembly_name` column (e.g. `HG00408_pat_hprc_r2_v1.0.1`) is the join key between the two files. The annotation filename is the assembly name with `_cat_v1.1.gff3.gz` appended.

460 of 466 assemblies have a matching annotation. The 6 unmatched are reference genomes with non-standard naming (GRCh38, CHM13, HG002, HG06807 genbank). 2 annotations (HG06807 hprc naming) lack a matching assembly. Only matched entries are included in the registry.

## Assembly Registry Format

Each entry in `assembly-registry.json` follows the custom genome JSON format used by IGV/PGB:

```json
{
  "id": "HG00408",
  "name": "HG00408_pat_hprc_r2_v1.0.1",
  "fastaURL": "http://localhost:8000/s3-proxy/human-pangenomics/working/HPRC/.../file.fa.gz",
  "indexURL": "http://localhost:8000/s3-proxy/human-pangenomics/working/HPRC/.../file.fa.gz.fai",
  "tracks": [
    {
      "name": "Gene annotations",
      "url": "...",
      "indexURL": "...",
      "format": "gff3"
    }
  ]
}
```

- `id` is the sample name (e.g. `HG00408`), stripped of haplotype/version metadata
- `name` is the full assembly name from the source CSV
- FASTA and index URLs are proxied through the local CORS proxy server (see below)
- Annotation track `indexURL` is `"TBD"` until the GFF3 has been tabix-indexed

## CORS Problem and S3 Proxy Solution

The S3 bucket (`human-pangenomics`) does not set `Access-Control-Allow-Origin` headers, so browsers block direct XHR requests from `localhost`. Three URL schemes were tried:

1. `s3://` — browsers cannot handle the S3 protocol at all
2. `https://<bucket>.s3.us-west-2.amazonaws.com/` — correct URL, but blocked by CORS
3. `http://localhost:8000/s3-proxy/<bucket>/<path>` — works

The solution is `scripts/run-local-s3-proxy-server.sh`, a Python HTTP server (port 8000) that:
- Serves static files from the PGB project root (for local annotation files)
- Proxies `/s3-proxy/<bucket>/<path>` requests to `https://<bucket>.s3.us-west-2.amazonaws.com/<path>`
- Adds CORS headers (`Access-Control-Allow-Origin: *`) to all responses
- Forwards HTTP `Range` headers, enabling IGV to stream regions of large FASTA files without downloading them entirely

## GFF3 Tabix Indexing

The raw GFF3 annotation files on S3 are regular gzip-compressed and unsorted — they cannot be randomly accessed by genomic region. Each file must be processed before use:

1. Download from S3
2. Decompress (gunzip)
3. Sort by chromosome and position
4. Recompress with bgzip (block gzip, supports random access)
5. Create tabix index (`.tbi` file mapping genomic coordinates to byte offsets)

See `notes/genomics/tabix-indexing-workflow.md` for the detailed rationale and manual steps.

### Scripts

- **`scripts/index-gff3.sh <file>`** — indexes a single local GFF3 file
- **`scripts/batch-index-gff3.sh`** — batch workflow that downloads from S3, indexes, and updates the registry
  - `--entry N` — process a single entry by zero-based index
  - `--first-n N` — process the first N entries
  - (no args) — process all entries
  - Indexed files are written to `data/genomes/`
  - Registry entries are updated with `localhost:8000` URLs for the sorted GFF3 and its `.tbi` index
  - Skips entries that are already indexed locally

## Current State

- 462 entries in `assembly-registry.json`
- All FASTA/index URLs routed through the S3 CORS proxy
- 1 annotation track fully indexed (HG00408) — served from `data/genomes/`
- 461 annotation tracks have `"indexURL": "TBD"` — ready to be indexed via `batch-index-gff3.sh`

## Files in This Directory

- `assembly-registry.json` — the registry
- `assemblies-fasta-and-index.numbers` — original assemblies data (Apple Numbers format)
- `annotations-gff3-format.numbers` — original annotations data (Apple Numbers format)
- `workflow.md` — this document
