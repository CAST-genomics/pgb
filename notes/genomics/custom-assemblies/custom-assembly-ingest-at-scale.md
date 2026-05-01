# Custom Assembly Ingest at Scale — Cost Analysis & Parallel Batch Design

**Audience:** PGB collaborators.
**Subject:** Hosting the full HPRC BigBed annotation set on a UCSD-hosted S3 bucket, and redesigning the ingest batch script to make that run practical.
**Status:** Executed. Production set is **460 assemblies** in `s3://pgb-browser-custom-annotations` (UCSD AWS account, `us-west-2`). Original target was 462; HG06807 (mat + pat) excluded — see "Outcomes" below. Cost analysis below was computed for 462 and remains representative — the per-file numbers are unchanged.

---

## Outcomes — what actually shipped

- **Bucket:** `s3://pgb-browser-custom-annotations` (new bucket in UCSD AWS account `849898819728`, `us-west-2`, public-read with CORS for browser Range fetches). Replaces the original plan to use `s3://pgb-bigbed` — that bucket lives in a different AWS account we don't control from this profile.
- **Count:** 460 BigBed files, not 462.
  - HG06807 mat + pat removed from `notes/genomics/custom-assemblies/hprc-annotations.csv`. HPRC has only published HG06807's `annotation/` and `alignments/` subdirectories under `release2/` — no FASTA, no `.fa.gz.fai`. Without the FAI we cannot produce chrom sizes for `bedToBigBed`.
- **Ingest run:** `--all --jobs 4` against the 461-row CSV. First pass: 457 ok, 5 fail. Five failures broke down as 3 transient `curl: (35|56) Connection reset by peer` against HPRC S3, plus the 2 unrecoverable HG06807 entries. Re-running `--samples HG00639,HG01952,HG02132 --jobs 2` cleared the transient failures.
- **Registry:** `public/custom-assemblies/custom-assemblies-460-ucsc-fasta-ucsd-bigbed.json` — same schema as the 12-entry file, with FASTAs still pointing at HPRC S3 (UCSC-team-hosted) and BigBeds pointing at the new UCSD bucket.
- **Script hardening:** `gff3-to-bigbed.sh` curl calls now use `-fsSL` so HTTP errors fail loudly at download time. The original cryptic `bedToBigBed: invalid unsigned integer "version="1.0""` symptom for HG06807 was the result of an S3 404 XML body being silently written to disk in place of the FAI.
- **Script flags:** `batch-gff3-to-bigbed.sh` gained `--bucket s3://NAME` and `--profile NAME` so the destination bucket and AWS CLI profile are no longer hard-coded; original defaults preserved.

---

## Part 1 — S3 Hosting Cost Analysis

### TL;DR

Hosting all 462 BigBed files costs roughly **$0.25/month in storage** and **effectively zero in bandwidth** under any realistic PGB usage. Scaling from 12 to 462 files is not a cost decision — it's a one-time ingest-runtime decision.

### 1.1 Measured baseline

The 12 BigBed files currently in `s3://pgb-bigbed`, produced by `scripts/batch-gff3-to-bigbed.sh` from the HPRC `_cat_v1.1` GFF3 annotations, are tightly clustered in size:

| Metric | Value |
|---|---|
| Min | 19.0 MB |
| Max | 19.7 MB |
| Mean | **~19.4 MB** |
| Sample size | 12 (6 samples × 2 haplotypes) |

Gene counts across HPRC annotations are very consistent — every assembly is a full human haplotype annotated by the same CAT v1.1 pipeline against the same reference — so per-file size is expected to stay near 19–20 MB across the full 462-assembly set.

**Projected total: 462 × 19.4 MB ≈ 8.96 GB (~9 GB).**

### 1.2 Storage cost

S3 Standard in `us-west-2` is **$0.023 per GB-month**.

| Storage class | $/GB-month | Monthly (9 GB) | Annual | Suitable? |
|---|---|---|---|---|
| S3 Standard | $0.023 | ~$0.21 | ~$2.50 | ✅ recommended |
| S3 Standard-IA | $0.0125 | ~$0.11 | ~$1.35 | ⚠️ adds per-retrieval fee |
| S3 Glacier Instant Retrieval | $0.004 | ~$0.04 | ~$0.44 | ❌ retrieval SLA too slow |

**Recommendation: stay on S3 Standard.** BigBed access is latency-sensitive (the PGB client issues HTTP Range reads interactively on user emphasis events), the absolute savings from IA or Glacier are under $2/year, and tiered classes introduce retrieval-fee and minimum-storage-duration surprises that aren't worth it at this volume.

### 1.3 Bandwidth — the access pattern is what matters

The standard mental model for "BigBed served to a genome browser" is IGV.js-style interactive panning and zooming, which generates continuous Range-request chatter. **That is not how PGB consumes these files.** PGB's access pattern is much lighter.

#### How PGB reads BigBed

The relevant code path is `src/annotationTrackController.ts`. When the user emphasizes an assembly in the pangenome graph:

```
assembly:emphasis event
  → build coordinate index from the assembly's spine walk
  → chr, bpStart, bpEnd = spine region (typically sub-Mb, one chromosome)
  → geneFeatureSource.getFeatures({ chr, start: bpStart, end: bpEnd })
  → render features onto the annotation canvas
  → done
```

Under the hood, `geneFeatureSource` is a `BWSource` from PGB's vendored IGV core (`src/igvCore/io/bigwig/`). It issues HTTP Range reads against the `.bb` file on S3 to fetch:

1. The BigBed header + zoom summary tables (one-time per session, cacheable by the browser)
2. The chromTree + R-tree chunks needed to descend to the spine region
3. The compressed data blocks that overlap `[bpStart, bpEnd]`

**Critical properties:**

- **One fetch per emphasis event.** Not one fetch per frame; not continuous while the user pans.
- **Bounded region.** The spine region is a fixed sub-range of one chromosome (e.g. `chr6:160,531,482-160,664,275` — ~130 kb in one HPRC dataset) and does not grow with zoom level.
- **No re-fetching on view changes.** PGB's 3D view and annotation canvas operate on the features already pulled for the emphasized assembly.
- **No fetch at all until emphasis.** Loading the app with 462 assemblies registered does not touch any BigBed file. A file is touched only if the user emphasizes *that specific assembly*, and only once per emphasis.

#### Per-emphasis bandwidth estimate

| Component | Typical size |
|---|---|
| BigBed header + zoom index + chromTree root | 1–4 KB |
| R-tree descent to the spine region | 5–20 KB |
| Compressed data blocks covering the spine region | 10–150 KB |
| **Total per emphasis event** | **~20–200 KB** |

The data-blocks figure is the swing factor, driven by gene density in the spine window. For typical HPRC sub-chromosomal regions PGB visualizes, **50–100 KB** is a reasonable central estimate.

#### Monthly bandwidth scenarios

S3 egress to internet: **first 100 GB/month free**, then ~$0.09/GB up to 10 TB.

| Scenario | Sessions/mo | Emphases/session | KB per fetch | Monthly egress | S3 cost |
|---|---|---|---|---|---|
| Light research use | 1,000 | 3 | 100 | 0.3 GB | ✅ free |
| Moderate use | 10,000 | 5 | 150 | 7.5 GB | ✅ free |
| Heavy use | 100,000 | 10 | 200 | 200 GB | ~$9/mo |
| "Mirror the bucket" | 100 full-file d/l | — | 9 GB each | 900 GB | ~$72/mo |

Under any realistic PGB usage — even well beyond current scale — steady-state bandwidth fits comfortably inside the S3 free egress tier. Meaningful cost only appears if someone is systematically mirroring entire `.bb` files, which is not PGB's access pattern.

#### Registry size is not a bandwidth driver

Hosting 12 vs 462 files does not change bandwidth. Bandwidth scales with how many emphasis events users trigger, not with how many assemblies are registered. Each emphasis touches exactly one BigBed file; unused assemblies cost only their storage footprint.

### 1.4 Request cost

S3 GET: **$0.0004 per 1,000** (us-west-2).

Each emphasis event produces ~10–30 Range GETs against one BigBed file (header, R-tree descent, data blocks). Even at 100,000 sessions × 10 emphases × 20 GETs = 20 M GETs, the bill is **~$8/mo**. In practice it will be a small fraction.

PUTs for initial ingest: 462 × $0.005/1,000 ≈ $0.002. One-time, rounds to zero.

### 1.5 One-time ingest cost

| Item | Cost |
|---|---|
| Data-in to `s3://pgb-bigbed` | $0 (S3 ingress is free) |
| PUT requests × 462 | ~$0.002 |
| Downloading 462 GFF3s from `human-pangenomics` S3 | $0 (HPRC's bucket, their egress; no charge to us) |
| Local compute / developer time | dominated by wall-clock, not dollars |

### 1.6 Total cost of ownership

| Line item | Monthly | Annual |
|---|---|---|
| Storage (9 GB, S3 Standard) | ~$0.21 | ~$2.50 |
| Egress (light–moderate use, within free tier) | $0 | $0 |
| Egress (heavy use, 200 GB/mo) | ~$9 | ~$108 |
| GET requests (heavy use) | ~$8 | ~$96 |
| **Steady-state expected** | **~$0.25** | **~$3** |
| **Worst-case heavy use** | **~$17** | **~$204** |

### 1.7 Recommendations

1. **Host the BigBed files on `s3://pgb-browser-custom-annotations`** (UCSD account, `us-west-2`). Trivial cost, bounded bandwidth. Original plan was `s3://pgb-bigbed`; that bucket lives in a different AWS account we don't control.
2. **Keep S3 Standard** — the tier savings don't justify the added latency and retrieval-fee complexity.
3. **Ensure CORS and `Accept-Ranges: bytes` stay enabled** on the new bucket. PGB's `BWSource` depends on both. (Configured at bucket creation; verify with `aws s3api get-bucket-cors --bucket pgb-browser-custom-annotations --profile ucsd-pangenome` if you suspect drift.)
4. **Parallelize the batch ingest script** (see Part 2) so the all-460 run finishes in ~1 hour instead of several.
5. **Monitor, don't pre-optimize.** If CloudWatch ever shows egress trending toward the 100 GB/month free-tier ceiling, revisit CloudFront. No reason to do it preemptively.

---

## Part 2 — Parallel Batch Ingest Design

### 2.1 Why parallelism matters

The current `scripts/batch-gff3-to-bigbed.sh` is serial: one assembly at a time, invoking `scripts/gff3-to-bigbed.sh` for each. Per-assembly wall time breaks down roughly as:

1. **HPRC S3 download** (~50–70 MB GFF3 per assembly) — single-connection HTTP, network-bound, CPU idle.
2. **UCSC tool chain** (`gff3ToGenePred` → `genePredToBigGenePred` → `sort` → `bedToBigBed`) — CPU-bound, single-threaded per tool, one core used.
3. **Upload** (~19 MB `.bb` PUT to S3) — network-bound.

These phases don't overlap *within* a single run, and the UCSC tools are single-threaded. On a modern laptop (~8–10 cores, gigabit down) one worker uses ~1 core and a fraction of the pipe. Running N workers concurrently gives near-linear speedup up to the point cores or bandwidth saturate.

**Expected wall-clock:**
- Serial (`--jobs 1`, current): estimated several hours for 462 assemblies.
- `--jobs 4`: roughly 1–2 hours.
- `--jobs 8`: around an hour, bounded by network + SSD I/O.

### 2.2 Implementation options considered

| Approach | Pros | Cons |
|---|---|---|
| **GNU `parallel`** | Clean, excellent log handling (`--tagstring`, `--joblog`) | Adds a dependency (`brew install parallel`) |
| **`xargs -P N`** | POSIX, already installed; small diff | Log interleaving needs manual work |
| **Bash `wait -n` loop** | No dependencies; fine-grained control | Most boilerplate; easy to get wrong |

**Chosen: `xargs -P N`.** Zero new dependencies. The diff is small. The log-interleaving problem has a clean workaround (per-assembly log files + one-line summary per worker).

### 2.3 Design overview

Three focused changes to `scripts/batch-gff3-to-bigbed.sh`:

1. **New `--jobs N` flag.** Defaults to `1` — current behavior preserved exactly.
2. **Pre-fetch `bigGenePred.as` up front.** Currently `gff3-to-bigbed.sh` lazily downloads this AutoSQL schema on first call (`if [ ! -f "$AS_FILE" ]`). With N parallel workers on a fresh machine, all N race on the same download/write. Pulling it up-front eliminates the race with zero added complexity.
3. **Extract the per-entry work into a shell function + fan out through `xargs -P`.** Each worker redirects verbose output to `data/genomes/logs/<stem>.log` and emits exactly one summary line (`[OK] <stem>` or `[FAIL] <stem>`) to the main stdout. At the end, print a success/failure count and list any failing stems.

### 2.4 Sketch

```bash
# --- New flag ---
JOBS=1
case "$1" in
    --jobs) JOBS="$2"; shift 2 ;;
    ...
esac

# --- Pre-fetch shared artifact once ---
AS_FILE="$GENOMES_DIR/bigGenePred.as"
[ -f "$AS_FILE" ] || curl -fsSL -o "$AS_FILE" \
    "https://genome.ucsc.edu/goldenPath/help/examples/bigGenePred.as"

# --- Worker, exported so xargs -P can invoke it ---
convert_one() {
    local gff3_url="$1" fai_url="$2"
    local stem
    stem=$(basename "$gff3_url" .gff3.gz); stem="${stem%.sorted}"
    local log="$GENOMES_DIR/logs/${stem}.log"
    mkdir -p "$GENOMES_DIR/logs"
    if "$SCRIPT_DIR/gff3-to-bigbed.sh" "$gff3_url" "$fai_url" > "$log" 2>&1 \
       && mv "$GENOMES_DIR/${stem}.bb" "$GENOMES_DIR/${stem}_bigGenePred.bb" \
       && aws s3 cp "$GENOMES_DIR/${stem}_bigGenePred.bb" \
            "$S3_BUCKET/${stem}_bigGenePred.bb" >> "$log" 2>&1; then
        echo "[OK]   $stem"
    else
        echo "[FAIL] $stem  (see $log)"
        return 1
    fi
}
export -f convert_one
export SCRIPT_DIR GENOMES_DIR S3_BUCKET

# --- Fan out ---
echo "$ENTRIES" | xargs -n 2 -P "$JOBS" bash -c 'convert_one "$@"' _
```

### 2.5 Pitfalls & mitigations

- **Disk headroom.** Each in-flight conversion leaves ~1–2 GB of intermediate files in `data/genomes/` (decompressed GFF3, genePred, bigGenePred, sorted bigGenePred) until `gff3-to-bigbed.sh` cleans up at the end. With `--jobs 8`, up to ~16 GB of transient disk. Fine on a laptop SSD; worth a note in the doc.
- **Memory.** `sort -k1,1 -k2,2n` on a human-haplotype bigGenePred file uses a few hundred MB of RSS. 8 concurrent sorts ≈ several GB. Fine on a 16 GB machine; tight on 8 GB — use `--jobs 3` there.
- **Concurrent S3 uploads.** Trivial load for S3; bounded by your upstream bandwidth.
- **Sweet spot.** Past `--jobs 8`, diminishing returns — cores, upstream bandwidth, or disk I/O become the bottleneck. Practical range is 4–8.
- **Error visibility.** Parallel output replaces the coherent per-assembly serial log with per-assembly log files. Script prints a final "N of M succeeded; failed: <list>" summary so partial failures don't hide.

### 2.6 Explicitly out of scope

For a one-time 462-file batch, **none** of the following are warranted; flag for future consideration if ingest becomes ongoing:

- Job queue / work-stealing scheduler
- Retry-on-failure logic
- Resume-from-checkpoint (e.g. skip assemblies already in `s3://pgb-bigbed`)
- Streaming pipelining between download and UCSC tool chain
- Moving ingest into AWS (EC2 in `us-west-2` would make the HPRC S3 pull free and fast, but the cost case doesn't support it at this volume)

### 2.7 Rollout — completed

1. ✅ Feature branch `bigbed-ingest-parallelism`.
2. ✅ `--jobs N` + pre-fetch + `xargs -P` fan-out implemented.
3. ✅ Smoke test (`--jobs 2 --samples HG00097`) — 2/2 ok.
4. ✅ Full run (`--all --jobs 4 --bucket s3://pgb-browser-custom-annotations --profile ucsd-pangenome`) — 460/462 ok after retry of 3 transient failures; HG06807 excluded.
5. ✅ Added `--bucket` and `--profile` flags so the destination is not hard-coded.
6. ✅ Hardened `gff3-to-bigbed.sh` curl calls with `-fsSL` to catch HTTP errors at download time.
7. ✅ Generated `public/custom-assemblies/custom-assemblies-460-ucsc-fasta-ucsd-bigbed.json` registry.

---

## Appendix — Sources & Assumptions

- **File sizes**: measured from `aws s3 ls s3://pgb-bigbed/` on the 12 uploaded bigGenePred BigBed files.
- **Access pattern**: derived from `src/annotationTrackController.ts` (event wiring + single-region feature fetch per `assembly:emphasis`) and `src/igvCore/io/bigwig/bwSource.js` / `bwReader.js` (HTTP Range implementation).
- **AWS pricing**: S3 Standard storage $0.023/GB-mo; egress-to-internet first 100 GB/mo free then $0.09/GB; GET $0.0004/1,000; PUT $0.005/1,000 — us-west-2 list prices as of recent reference. Verify with the AWS Pricing Calculator before committing.
- **Per-emphasis bandwidth**: estimated from BigBed structure (header + R-tree + compressed data blocks); not directly measured. The 20–200 KB range is reasoned; central estimate 50–100 KB. A short Chrome DevTools → Network tab pass (filter `.bb`) on a local PGB session would replace this estimate with real numbers if needed.
- **Serial batch wall time**: estimated, not measured end-to-end at scale. Single-assembly runs are 2–5 minutes.
