# **Gene Projection (Projection / Liftover)**

**Purpose:** add a *Projected Genes* track for assemblies that lack native annotations (e.g., HG002/HG005), while preserving your bi-directional mapping between the graph path and the top track.

---

## 0) TL;DR

* Compute an alignment between **source** (GRCh38 or CHM13) and **target** (HG00x assembly).
* Convert the alignment to **chains of monotone blocks** (piece-wise affine maps, ± strand).
* **Project** source features (exons/transcripts) across those chains → target intervals.
* **Score** each projection; keep the best locus; tag ambiguity/fragmentation.
* Serve results as a **Projected Genes** track with confidence coloring; keep the sequence track as a fallback/toggle.

---

## 1) Goals / Non-Goals

**Goals**

* Show gene models on HG00x by projecting from GRCh38/CHM13.
* Guarantee responsive bi-directional cursor behavior (graph ⇄ projected track).
* Be explicit about uncertainty (duplications, low identity, gaps).

**Non-Goals**

* “Invent” genes where none align.
* Perfect parity with Ensembl/RefSeq—projection reflects *alignment*, not curation.

---

## 2) Concepts & Terminology

* **Projection/Liftover:** map intervals from a source assembly to a target assembly using a DNA alignment.
* **Chain / Block:** a monotone mapping `source[s,e) ↦ target[s',e')` on a fixed strand; piece-wise linear.
* **Transcript projection:** set of projected exons + metadata (coverage, identity, splice checks).
* **One-to-many:** duplicated loci in the target yield multiple candidate projections.

---

## 3) System Architecture (high-level)

```
+-------------+     PAF/HAL      +----------------+     JSON/tiles     +------------------+
| Source anno | -- alignment --> |  Projector Svc | -- API/stream --> | Pangenome Browser |
| (GTF/GFF)   |                  |  (offline+API) |                   |  (Projected Track)|
+-------------+                  +----------------+                   +------------------+
       ^                                  ^
       |                                  |
 GRCh38/CHM13 FASTA                 Target FASTA (HG00x)
```

* **Offline job** builds alignment & chains, projects transcripts, stores **indexed tiles**.
* **API** serves:

  * `/projected/genes?target=HG005&region=<contig:lo-hi>`
  * `/map?src=GRCh38&pos=chrX:...&target=HG005` (and reverse)
  * `/stats` for confidence summaries.

---

## 4) Pipelines You Can Choose

### A) Pairwise (PAF-based) — *fast to prototype*

1. **Align** source ↔ target

   ```bash
   minimap2 -x asm20 -t 16 --secondary=no -c source.fa target.fa > src_vs_tgt.paf
   # -c adds base-level 'cs' strings; --secondary=no simplifies downstream chaining
   ```
2. **Chain** PAF records into monotone blocks (same target contig, ordered, consistent strand).

   * You can start with `paftools.js liftover` to get chain-like segments, or implement a small chainer (details in §6).
3. **Project** GTF/GFF exons through blocks → target intervals.
4. **Score** & **filter** projections; emit best locus per transcript.

**Pros:** lightweight, simple infra.
**Cons:** pairwise only; no global consistency across many assemblies.

---

### B) Multi-genome (HAL / Progressive Cactus) — *scales better*

* Obtain or build a **HAL** alignment including GRCh38/CHM13 and HG00x.
* **Project** using `halLiftover` and/or parse HAL directly.

  ```bash
  halLiftover pangenome.hal GRCh38 genes.gff3 HG005 projected.gff3
  ```

**Pros:** consistent across dozens of assemblies.
**Cons:** heavy preprocessing; steeper learning curve.

---

### C) Gene-aware projector (Liftoff)

* `liftoff -g source.gff3 source.fa target.fa -o projected.gff3 --polish`
  **Pros:** tuned for genes; validates exon structure.
  **Cons:** standalone tool; less direct control over block-level mapping.

---

## 5) Data Structures

### 5.1 Chain blocks (targeted minimal schema)

```ts
type ChainBlock = {
  srcChr: string; srcStart: number; srcEnd: number; // half-open, 0-based
  tgtChr: string; tgtStart: number; tgtEnd: number; // half-open, 0-based
  strand: '+' | '-';                                // relative to source
  // optional fine-grain edits for identity calc & gap accounting:
  ops?: Array<{ op: 'M'|'I'|'D'|'X', len: number }>;
  score?: number; // alignment score/log-odds
  chainId: string; order: number; // to keep sequence of blocks
};
```

### 5.2 Projected transcript (browser payload)

```json
{
  "type": "projected_transcript",
  "source_ref": "GRCh38",
  "target": "HG005",
  "transcript_id": "ENST00000331789.9",
  "gene_id": "ENSG00000112345.10",
  "strand": "+",
  "score": 0.97,
  "status": "high",
  "duplications": 0,
  "exons": [
    { "ctg": "JAHKSD010000078.1", "start": 12345, "end": 12789 },
    { "ctg": "JAHKSD010000079.1", "start":   456, "end":   890 }
  ],
  "notes": { "cov": 0.98, "id": 0.97, "splice_ok": true, "fragments": 2 }
}
```

> Tile these by `ctg` and genomic bins (e.g., 50–100 kb) for fast range queries.

---

## 6) Algorithms

### 6.1 Chaining PAF alignments (simplified)

1. Load **primary** PAF hits; group by target contig and strand.
2. Sort by source start; greedily append records if both source and target coordinates **increase** (or **decrease** for `-` strand) and the gap is bounded (e.g., ≤50 kb).
3. Split when order reverses or gap too large.
4. Convert each kept hit to `ChainBlock` (derive `ops` from `cs` or CIGAR).

> You can replace this with a DP “maximum scoring chain” if needed, but a greedy pass works well in practice for local projects.

### 6.2 Interval projection (exon)

Piece-wise affine transform across overlapping blocks:

```js
function projectInterval(srcStart, srcEnd, blocks) {
  const out = [];
  for (const b of blocks) {
    const s = Math.max(srcStart, b.srcStart);
    const e = Math.min(srcEnd,   b.srcEnd);
    if (s < e) {
      const srcLen = b.srcEnd - b.srcStart;
      const tgtLen = b.tgtEnd - b.tgtStart;
      const map = (pos) => b.strand === '+'
        ? b.tgtStart + (pos - b.srcStart) * (tgtLen / srcLen)
        : b.tgtEnd   - (pos - b.srcStart) * (tgtLen / srcLen);
      out.push({ ctg: b.tgtChr, start: Math.floor(map(s)), end: Math.ceil(map(e)) });
    }
  }
  return out; // may be fragmented across blocks
}
```

### 6.3 Transcript projection

* Sort exons by **source strand** (5′→3′).
* Project each exon; merge adjacent projected fragments if they touch and are from consecutive blocks.
* If any exon fails to map (coverage < threshold), mark transcript as **partial**.

### 6.4 Confidence scoring

For transcript `T` with exons `E`:

* **Coverage** `cov(T) = mapped_bp(T) / total_bp(T)`
* **Identity** `id(T) = matches / (matches + mismatches + indels)` from block `ops`
* **Splice check**: verify canonical donor/acceptor (GT/AG by default) around projected introns; allow configurable motif sets.
* **Uniqueness penalty**: if >1 locus meets thresholds, keep best score, set `duplications = k-1`.

**Overall score:**
`score = cov × id × splice_factor × uniqueness_factor`

Classify for UI:

* `high`: cov ≥ 0.95, id ≥ 0.95, splice\_ok
* `mid` : cov ≥ 0.75, id ≥ 0.85
* `low` : otherwise (hide by default)

---

## 7) Bi-Directional Mapping Integration

You already map **graph ⇄ target assembly (contig,pos)**.
Projection adds *source* context and a *gene layer* on the **target**:

* **Graph → Track:** `(ctg,pos)` → locate overlapping projected exon(s) in the visible tile; draw caret/tooltip with transcript ID, exon #, and original **GRCh38** coordinates.
* **Track → Graph (drag):** screen `x` → `(ctg,pos)` (sequence track mapping you already have) → nearest node/edge.

> Optional: expose **reverse mapping** `(ctg,pos@HG005) → (chr,pos@GRCh38)` for tooltips using the same chains.

---

## 8) API Sketch

```
GET /projected/genes
  ?target=HG005
  &ctg=JAHKSD010000078.1
  &start=100000&end=200000
  -> returns { transcripts: [...], meta: {...} }

GET /projected/map
  ?src=GRCh38&src_ctg=chrX&src_pos=15432123
  &target=HG005
  -> returns { ctg, pos, strand, conf }

GET /projected/reverse-map
  ?target=HG005&ctg=JAHKSD010000078.1&pos=12345
  &src=GRCh38
  -> returns { chr, pos, conf }
```

* **Caching key:** `{alignVersion}:{source}:{target}:{ctg}:{bin}`
* Return **compressed** JSON (gzip/brotli).
* Stream large responses by tiles.

---

## 9) Performance & Storage

* Precompute per-target **chain blocks** and **projected transcript tiles**.
* Index tiles by `(ctg, bin)`.
* Typical sizes (rule-of-thumb):

  * Chains: a few MB per pair.
  * Projected GFF3→JSON: tens of MB per genome; with tiling & gzip: a few MB per locus.

---

## 10) Validation Plan

* **Unit tests** for coordinate math (± strand, boundaries, off-by-one).
* **Round-trip**: project src→tgt→src and measure IoU (overlap ≥0.95 for high-conf).
* **Golden set**: compare against UCSC `liftOver`/`CrossMap` or `halLiftover` at known loci.
* **Biology checks**:

  * exon count preserved (allowable merges/splits flagged),
  * splice motifs conserved,
  * CDS frame integrity (optional: translate & compare protein length).

---

## 11) UI/UX for *Projected Genes* Track

* Header: **“Projected from GRCh38”** with an info icon.
* Legend: **High/Mid/Low** confidence; *duplication* badge for one-to-many.
* Glyphs: solid (high), semi-transparent (mid), dashed (low/partial).
* Tooltip: transcript ID, gene symbol, coverage, identity, splice status, original GRCh38 locus.
* Toggle: **Projected genes ↔ Sequence coordinates** (fallback).

---

## 12) Reference Commands & Snippets

### 12.1 Build PAF and chains

```bash
# Alignment
minimap2 -x asm20 -t 16 --secondary=no -c grch38.fa hg005.fa > grch38_vs_hg005.paf

# Produce liftover-like chains (quick start)
paftools.js liftover -l 1000 grch38_vs_hg005.paf > grch38_vs_hg005.chains
```

### 12.2 Minimal JS/TS projector core

```ts
type Interval = { chr:string; start:number; end:number; strand:'+'|'-' };
type Exon = Interval;
type Transcript = { id:string; gene:string; strand:'+'|'-'; exons:Exon[] };

function projectExon(ex: Exon, blocks: ChainBlock[]): Exon[] {
  // select overlapping blocks for ex.chr & strand
  const bs = blocks.filter(b => b.srcChr===ex.chr && overlaps(b.srcStart,b.srcEnd,ex.start,ex.end));
  return projectInterval(ex.start, ex.end, bs).map(p => ({ chr:p.ctg, start:p.start, end:p.end, strand:'+' }));
}

function projectTranscript(tx: Transcript, chain: ChainBlock[]): {exons:Exon[], cov:number, id:number} {
  const outs: Exon[] = [];
  let mapped=0, total=0;
  for (const ex of tx.exons) {
    total += ex.end - ex.start;
    const pieces = projectExon(ex, chain);
    mapped += pieces.reduce((s,p)=>s + (p.end-p.start), 0);
    outs.push(...pieces);
  }
  const cov = mapped / Math.max(1,total);
  // identity: aggregate from blocks.ops overlapped by exons (omitted here)
  const id = 0.95; // placeholder
  return { exons: mergeAdjacent(outs), cov, id };
}
```

---

## 13) Risks & Mitigations

* **Duplications → multiple hits:** keep best, badge duplicates; allow a “show all” toggle.
* **Large indels / rearrangements:** exons split across blocks—render as multiple pieces; keep links by exon index.
* **True absence:** don’t force projection; mark *not-mapped* cleanly.
* **Performance:** tile & cache; precompute; stream only visible bins.
* **Off-by-one / strand flips:** centralize coordinate conventions; exhaustive tests.

---

## 14) Rollout Plan

1. **Prototype (pairwise PAF)** on a single locus (e.g., OPN1MW).
2. **Integrate** *Projected Genes* track behind a feature flag; add UI legend + toggle.
3. **QA** with validation plan; compare against halLiftover/Liftoff for spot loci.
4. **Scale** to additional assemblies; consider HAL if many genomes are required.

---

### Appendix A — Coordinate Conventions

* Use **0-based half-open** intervals internally `[start, end)`.
* Input/Output formatting (browser & GFF3) can be adapted to 1-based inclusive as needed.
* Store strand relative to **source**; invert appropriately when drawing on target.

### Appendix B — Confidence Heuristics (defaults)

* `cov_hi=0.95`, `cov_mid=0.75`; `id_hi=0.95`, `id_mid=0.85`.
* Max gap to chain across: 50 kb (adjust per locus).
* Splice motifs: GT-AG (+ rare GC-AG, AT-AC if enabled).

---

**Bottom line:** this design lets you light up HG00x with *Projected Genes* quickly (PAF route), keep the UX honest with explicit confidence, and gives you a path to a multi-assembly solution (HAL) if/when you need it.
