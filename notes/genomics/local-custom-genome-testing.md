# Testing Custom Genomes with Local Data

## Overview

HPRC custom genome files (FASTA, GFF3) are too large to commit to the repo. We serve them locally via a Python HTTP server on port 8000, alongside PGB's Vite dev server on port 5173. This is the same strategy used in the igv-webapp project.

Both FASTA and GFF3 files use **indexed access** via HTTP range requests, so the browser only fetches the small slice of data needed for the current view. See `indexed-file-creation-workflow.md` for how to create the index files.

## Prerequisites

The following files must be in `~/Downloads/`:

| File | Size | Description |
|------|------|-------------|
| `HG00099_hap1_hprc_r2_v1.0.1.fa` | ~2.9 GB | Uncompressed FASTA sequence |
| `HG00099_hap1_hprc_r2_v1.0.1.fa.fai` | ~6 KB | FASTA index |
| `HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz` | ~64 MB | Bgzip-compressed, sorted GFF3 annotations |
| `HG00099_hap1_hprc_r2_v1.0.1_cat_v1.1.sorted.gff3.gz.tbi` | ~200 KB | Tabix index for GFF3 |

If you only have the original compressed files, see `indexed-file-creation-workflow.md` for preparation steps.

## Setup (one-time)

Create symlinks from `data/genomes/` to `~/Downloads/`:

```bash
./scripts/setup-local-genome.sh
```

This avoids duplicating the large files. The `data/genomes/` directory is gitignored.

## Running

Open two terminals:

**Terminal 1 — Data server (port 8000):**
```bash
./scripts/run-local-server.sh
```

**Terminal 2 — PGB dev server (port 5173):**
```bash
npm run dev
```

## Custom genome registry

The file `data/test-local.json` is the custom genome registry. It contains an array of genome configs pointing to `http://localhost:8000/data/genomes/...`:

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

The `indexURL` fields are what enable range-based access:
- Top-level `indexURL` → FASTA index (`.fai`) → `IndexedFasta` class
- Track-level `indexURL` → tabix index (`.tbi`) → `FeatureFileReader.loadFeaturesWithIndex()`

To activate the custom registry in PGB, this call exists in `src/main.js`:

```js
setCustomRegistryURL('http://localhost:8000/data/test-local.json')
```

## Test datasets

The following HPRC datasets in `public/hprc-project/` contain nodes with the HG00099 assembly and can be used for testing:

- `chr6-160531482-160664275.json`
- `hello-hprc.json`
- `il7-pca-coordinates.json`
- `macrod2.json`

## How it works

```
Browser (port 5173)
  │
  ├── PGB app served by Vite
  │
  └── genomeRegistry.js (facade)
        ├── igvOrgRegistrySource  →  igv.org/genomes/genomes3.json
        └── customRegistrySource  →  http://localhost:8000/data/test-local.json
                                        └── genome files served from data/genomes/ (symlinks)
                                              ├── .fa + .fai     → IndexedFasta (range requests)
                                              └── .gff3.gz + .tbi → FeatureFileReader (range requests)
```

Both sources initialize in parallel. Custom configs win on ID collision with igv.org configs.

## Adding more custom genomes

1. Prepare the indexed files (see `indexed-file-creation-workflow.md`)
2. Place all files in `~/Downloads/`
3. Add the filenames to `scripts/setup-local-genome.sh`
4. Re-run `./scripts/setup-local-genome.sh`
5. Add a new config entry to `data/test-local.json`
