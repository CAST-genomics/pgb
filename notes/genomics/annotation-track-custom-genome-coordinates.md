# Annotation Track Coordinate System for Custom Genomes

This document describes the coordinate system used when rendering gene annotation tracks in PGB, the logical bug that prevented correct rendering for custom (personal assembly) genomes, and the implemented approach to addressing it.

---

## Conceptual Model: Pangenome Graph and Assembly-Specific Coordinates

Before diving into the bug and implementation, it helps to establish the correct mental model—and to see where a natural assumption goes wrong.

### The Pangenome Graph Model

In the pangenome graph:

- **Each node** represents one particular genomic extent: a contiguous block of base pairs. The same sequence is shared by every assembly that passes through that node.
- **The extent is identical** across assemblies: the length and the actual DNA sequence are the same. All assemblies that traverse a node share that exact block.
- **Assembly-specific coordinates differ**: Where that block sits in each assembly's coordinate system depends on the assembly. For GRCh38 it might be chr1:25240000–25460000; for HG00097#1 it might be CM094060.1:10000–45895. Same sequence, different (contig, position).
- **Annotation rendering**: To show features for an emphasized assembly, we must query that assembly's annotation source (GFF3, etc.) using that assembly's coordinate system. So we need the mapping: node → (sequence_id, start, end) in that assembly's coordinates.

### The Discrepancy in Thinking

A natural mistake is to treat the pangenome as a single linear genome: one coordinate space that all assemblies share. That would imply we could use reference coordinates (e.g., chr1:25240000–25460000) for every assembly's feature query.

But we are **not** dealing with one linear genome. Each assembly has its own coordinate system—its own contigs, its own ordering. The graph encodes shared structure; coordinates are per-assembly. We must resolve assembly-specific coordinates from the assembly walk and node metadata before querying features.

### Implications for the Annotation Track

The annotation track renders features for the emphasized assembly. The feature source (e.g., TextFeatureSource) expects `(chr, start, end)` in that assembly's coordinate system. For reference assemblies (GRCh38, CHM13), the locus and spine are already in chr1 coordinates, so no transform is needed. For custom assemblies, we must use the correct `sequence_id` and assembly-specific coordinates. The implemented fix addresses the sequence ID; the start/end for custom assemblies use a placeholder (0-based) until proper assembly-specific offsets are available.

---

## Table of Contents

1. [Conceptual Model](#conceptual-model-pangenome-graph-and-assembly-specific-coordinates)
2. [Background](#background)
3. [How IGV.js Avoids This Problem](#how-igvjs-avoids-this-problem)
4. [Current Architecture](#current-architecture)
5. [The Logical Bug (Addressed)](#the-logical-bug-addressed)
6. [Implemented Solution](#implemented-solution)
7. [Sequence ID Semantics](#sequence-id-semantics)
8. [Future Work: Assembly-Specific Offsets](#future-work-assembly-specific-offsets)
9. [References](#references)

---

## Background

PGB displays gene annotation tracks (exons, introns, CDS, etc.) when a user emphasizes an assembly in the pangenome graph. For reference genomes (e.g., GRCh38), annotations are fetched from igv.org and rendered correctly. For custom genomes (HPRC personal assemblies such as HG00097, HG00099), the infrastructure exists to load indexed FASTA + GFF3. The annotation track previously failed for custom genomes because the feature query used the wrong coordinate system.

The root cause was that the code used **reference (locus) coordinates** for all assemblies, but custom assemblies use different contigs and coordinate systems. The node data provides the contig name (`sequence_id`) and the extent (`length`), but not the **start position** on that contig. The implemented fix addresses the sequence ID and origin; proper assembly-specific start positions remain future work.

---

## How IGV.js Avoids This Problem

In the IGV.js project (see `/Users/turner/IGVDevelopment/igv.js`), the coordinate system is unified by design. There is **no distinction** between looking up a locus, computing a locus, and handing that locus to the annotation track renderer. The same coordinates flow through the entire pipeline.

### Single-Genome Model

IGV.js displays **one genome at a time**. When the user loads a genome (e.g., hg38 or a custom genome with contigs like CM094060.1), that genome defines the coordinate space. The locus is always expressed in that genome's coordinates:

- For hg38: the locus might be `chr1:25240000-25460000`
- For a custom genome: the locus might be `CM094060.1:10000-45895`

The user navigates within the genome. If they jump to a different chromosome/contig, the locus updates to that contig's coordinate system.

### The ReferenceFrame

The central object is `ReferenceFrame` (`js/referenceFrame.js`), which holds:

- `chr` — the sequence ID (from the genome's chromosome list)
- `start`, `end` — the visible range in base pairs
- `bpPerPixel` — scale for rendering

The `ReferenceFrame` is created from the locus and is tied to `browser.genome`. It uses `genome.getChromosome(chr)` to validate and look up chromosome bounds. So `chr`, `start`, and `end` are always in the genome's coordinate system.

### Feature Loading

When a track needs features, the viewport calls `loadFeatures()` (`js/trackViewport.js`):

```javascript
const referenceFrame = this.referenceFrame
const chr = referenceFrame.chr
const bpStart = Math.floor(Math.max(0, referenceFrame.start - bpWidth))
const bpEnd = Math.ceil(Math.min(chrLength, referenceFrame.start + bpWidth + bpWidth))
// ...
const features = await this.getFeatures(track, chr, bpStart, bpEnd, referenceFrame.bpPerPixel)
```

The `chr`, `bpStart`, and `bpEnd` come directly from the `ReferenceFrame`. They are passed to `track.getFeatures()`, which forwards them to `featureSource.getFeatures()`. The feature source (e.g., `TextFeatureSource`) queries the GFF3/BED file with those coordinates.

Because the locus and the genome are always in sync, the coordinates passed to `getFeatures` always match the annotation file's coordinate system. No transformation is needed.

### Why PGB Is Different

PGB has a **pangenome model**: multiple assemblies are visible simultaneously in a graph. The view has a single locus (e.g., `chr1:25240000-25460000`) that defines the **reference** coordinate system—the coordinate space of the overall view. When the user emphasizes an assembly, the annotation track should show that assembly's genes. But:

- The locus is fixed in reference coordinates (chr1)
- The emphasized assembly may use different contigs (e.g., CM094060.1 for HG00097#1)
- The spine's `bpStart`/`bpEnd` are computed in reference coordinates

So PGB cannot simply pass the locus through unchanged. It must **transform** from the view's reference coordinates to the emphasized assembly's coordinate system before calling `getFeatures`. The implemented fix handles the sequence ID; proper assembly-specific start/end offsets are described in "Future Work".

### Summary

| Aspect | IGV.js | PGB |
|--------|--------|-----|
| Genomes displayed | One at a time | Multiple (pangenome graph) |
| Locus | Always in current genome's coordinates | Fixed in reference coordinates |
| Feature query | Locus → ReferenceFrame → getFeatures (no transform) | Per-assembly: sequenceId + bpStart/bpEnd from spine |
| Bug potential | None—unified coordinate system | Addressed: GenomicService passes per-assembly config |

IGV.js solves the problem by never having multiple coordinate systems in play at once. PGB explicitly handles the mapping via GenomicService, which computes per-assembly `sequenceId` and `locusStartBp` and passes them in the config.

---

## Current Architecture

### Data Flow

1. **Locus**: The user views a region, e.g. `chr1:25240000-25460000`. The locus defines the reference chromosome and base-pair range.

2. **Per-assembly config (GenomicService)**: For each assembly, `GenomicService.initialize()` computes assembly-specific values and passes them explicitly in `assessmentConfig`:
   - `sequenceId` — from the assembly key (`assemblyKey.split('#')[2]`)
   - `locusStartBp` — `this.locus.startBP` for reference assemblies, `0` for custom (placeholder until proper start data exists)
   - Reference vs. custom is determined by `sequenceId === this.locus.chr`

3. **Assembly walk**: `PangenomeService.getAssemblyWalk(assemblyKey)` returns an ordered list of node IDs for that assembly.

4. **Spine features**: `getSpineFeatures(assemblyKey, assessOpts)` builds a spine from the walk. It consumes `locusStartBp` and `sequenceId` from `assessOpts` (no decision logic). For each node:
   - `bpStart` = accumulated position (starting from `locusStartBp`)
   - `bpEnd` = `bpStart` + node length
   - The spine object includes `sequenceId` for downstream use.

5. **Annotation render**: When an assembly is emphasized, `AnnotationRenderService.handleAssemblyEmphasis()`:
   - Gets `chr` from `spine.sequenceId` (fallback: `locus.chr`)
   - Gets `bpStart` and `bpEnd` from the first and last spine nodes
   - Calls `getFeatures(chr, bpStart, bpEnd)` to fetch annotations
   - Renders the returned features

### Spine Coordinate Calculation

The spine coordinates are built in `pangenomeService.js` using values from the config:

```javascript
let x = Number(locusStartBp) || 0;   // from assessOpts: locus start for reference, 0 for custom
const spineNodes = [];
for (const id of path.nodes) {
    const len = this.graph.nodes.get(id)?.lengthBp || 0;
    spineNodes.push({ id, bpStart: x, bpEnd: x + len, lengthBp: len });
    x += len;
}
const spine = { assemblyKey, nodes: spineNodes, edges: ..., lengthBp: ..., sequenceId };
```

For **reference assemblies**, `locusStartBp` is the locus start (chr1 position), so spine coordinates align with the annotation file. For **custom assemblies**, the origin is `0` (placeholder); proper assembly-specific starts are future work.

### Feature Query

`TextFeatureSource.getFeatures({ chr, start, end })` passes these to `FeatureFileReader.readFeatures(chr, start, end)`. The `chr` now comes from `spine.sequenceId`, so the query uses the correct contig (e.g., `CM094060.1`) for custom genomes.

---

## The Logical Bug (Addressed)

### What the Code Previously Did

For **every** emphasized assembly (including custom genomes), the code used:

- `chr` = from the locus (always `chr1` when viewing chr1:25240000-25460000)
- `bpStart` = first spine node's `bpStart` (reference coordinate)
- `bpEnd` = last spine node's `bpEnd` (reference coordinate)

So the feature query was always: `chr1:bpStart-bpEnd`.

### Why This Worked for GRCh38

For GRCh38 (and CHM13, HG002, etc.):

- The locus is in chr1 coordinates.
- The spine `bpStart`/`bpEnd` are in chr1 coordinates (they derive from `locusStartBp`).
- The RefSeq/annotation track uses chr1 as the sequence ID.
- All three align: the query `chr1:25240000-25460000` correctly fetches features for that region.

### Why This Failed for Custom Genomes

For HG00097#1 (and other HPRC personal assemblies):

- The locus was chr1 (the reference).
- The spine `bpStart`/`bpEnd` were chr1 coordinates.
- But the HG00097 GFF3 uses seqids like `CM094060.1` or `HG00097#1#CM094060.1`—**not** chr1.
- The code queried `chr1:bpStart-bpEnd`, which does not exist in the HG00097 GFF3. No features were returned.

### Summary of the Bug

| Aspect | Previous behavior | Implemented fix |
|--------|-------------------|-----------------|
| Sequence ID (chr) | Always from locus (chr1) | Per-assembly: `spine.sequenceId` from assembly key |
| Spine origin | Same for all assemblies | Reference: locus start; Custom: 0 (placeholder) |
| Start/end for custom | Reference coordinates | 0-based spine (placeholder until proper assembly-specific offsets exist) |

---

## Implemented Solution

All coordinate-selection logic lives in **GenomicService**. This keeps the design fluid: when proper assembly-specific start data becomes available, only GenomicService needs to change.

### GenomicService (`src/genomicService.js`)

For each assembly, before calling `getSpineFeatures`:

```javascript
const sequenceId = assemblyKey.split('#')[2] ?? '';
const isReference = (sequenceId === this.locus.chr);
const effectiveLocusStartBp = isReference ? this.locus.startBP : 0;

const assessmentConfig = {
    // ...other options...
    locusStartBp: effectiveLocusStartBp,
    sequenceId,
};
pangenomeService.getSpineFeatures(assemblyKey, assessmentConfig, walkConfig);
```

### PangenomeService (`src/pangenomeService.js`)

Consumes `locusStartBp` and `sequenceId` from `assessOpts`. No decision logic—just pass-through. Adds `sequenceId` to the spine object for downstream use.

### AnnotationRenderService (`src/annotationRenderService.js`)

Uses `chr = spine.sequenceId ?? this.genomicService.locus.chr` for the feature query. Falls back to locus chr when `sequenceId` is absent (e.g., legacy callers).

### Future Extension

When assembly-specific start positions are available, update only GenomicService:

```javascript
const effectiveLocusStartBp = isReference
    ? this.locus.startBP
    : (lookupAssemblyStart(assemblyKey) ?? 0);
```

---

## Sequence ID Semantics

Understanding `sequence_id` in the node data is essential.

### In the Data File (e.g., hello-hprc.json)

Each node has an `assembly` array. Each entry has:

- `assembly_name` (e.g., GRCh38, HG00097)
- `haplotype` (e.g., "0", "1", "2")
- `sequence_id` (the contig/chromosome identifier)

### Two Naming Conventions

| Assembly type | sequence_id example | Meaning |
|---------------|---------------------|---------|
| Reference (GRCh38, CHM13) | `chr1` | Chromosome name in the reference |
| Personal (HG00097, HG00099) | `CM094060.1`, `JBHDWO010000005.1` | GenBank/RefSeq accession of the contig |

Both are sequence identifiers; the naming convention differs by assembly type.

### HPRC FASTA Naming

The HPRC FASTA files use a compound format: `{sample}#{haplotype}#{accession}`. For example, `HG00097#1#CM094060.1`. The GFF3 may use either the full compound name or just the accession (`CM094060.1`), depending on how the files were produced. The genome config and chromosome alias manager must ensure the query `chr` matches the GFF3 `seqid`.

---

## Future Work: Assembly-Specific Offsets

The node provides `sequence_id` (which contig) and `length` (extent in bp). It does **not** provide the start position on that contig. The start position can be derived from the assembly walk. The current implementation uses `0` as a placeholder for custom assemblies; the algorithm below describes how to compute proper offsets when that data is available.

### Key Insight

The assembly walk defines the order of nodes along the assembly's path. Consecutive nodes on the **same contig** form a contiguous block. The start position of a node on its contig is the sum of lengths of all **prior** nodes on that same contig.

### Algorithm

1. **Walk the assembly path** in order (as returned by `getAssemblyWalk(assemblyKey)`).

2. **For each node** in the walk:
   - Look up the node's assembly entry for this assembly (match `assembly_name` and `haplotype` to get `sequence_id`).
   - Get the node's `lengthBp`.

3. **Maintain a cumulative offset per contig**:
   - When we encounter a node on contig C, its start on C = current cumulative offset for C.
   - Its end on C = start + node length.
   - After processing, add the node length to the cumulative offset for C.
   - When we first see a new contig, its cumulative offset starts at 0.

4. **Result**: For each node, we have `(sequence_id, start, end)` in assembly-specific coordinates.

### Example

Assembly: HG00097#1. Walk order: A → B → C → D.

| Node | sequence_id | lengthBp | Cumulative on contig | start | end |
|------|-------------|----------|---------------------|-------|-----|
| A | CM094060.1 | 10,000 | 0 | 0 | 10,000 |
| B | CM094060.1 | 35,895 | 10,000 | 10,000 | 45,895 |
| C | CM094075.1 | 8,000 | 0 (new contig) | 0 | 8,000 |
| D | CM094075.1 | 12,000 | 8,000 | 8,000 | 20,000 |

For node B (e.g., 5504+): query GFF3 for `CM094060.1:10000-45895` (0-based) or `CM094060.1:10001-45895` (1-based, depending on GFF3 convention).

### Coordinate Conventions

- **GFF3**: 1-based, inclusive. Column 4 = start, column 5 = end.
- **PGB FeatureParser**: Converts to 0-based for internal use (`feature.start`, `feature.end`).
- **Tabix**: Uses 0-based, half-open `[start, end)` in some implementations; verify `FeatureFileReader` and tabix index expectations.

When implementing, ensure consistency between the coordinates you compute and the coordinates expected by `readFeatures(chr, start, end)`.

### Multiple Contigs in the View

When the spine spans multiple contigs (e.g., nodes on CM094060.1 and CM094075.1), you cannot issue a single feature query. Options:

1. **One query per contig**: For each distinct `(sequence_id, start, end)` range in the spine, issue a separate `getFeatures(sequence_id, start, end)` and merge the results.
2. **One query per node**: Simpler but more requests; may be acceptable for small spines.
3. **Batch by contig**: Group consecutive nodes on the same contig, compute the min start and max end for that group, and issue one query per contig.

The feature renderer expects a single list of features for the view. Merging features from multiple queries and sorting by position should produce the correct input.

### Genome ID and Haplotype

The emphasized assembly is passed as e.g. `HG00097#1#CM094060.1`. The `AnnotationRenderService` parses this for `getGenomePayload` (genomeId, haplotype). The `sequence_id` in the assembly key (third segment) is used for the feature query.

### Chromosome Name Aliasing

The GFF3 may use `HG00097#1#CM094060.1` while the assembly key has `sequence_id: "CM094060.1"`. The `ChromAliasManager` in `TextFeatureSource` maps between genome chromosome names and the names in the file. Ensure the query `chr` matches what the GFF3 and genome's `.fai` use.

---

## References

### PGB (this project)

- `src/genomicService.js` — per-assembly config: `locusStartBp`, `sequenceId`, reference vs. custom logic
- `src/annotationRenderService.js` — `handleAssemblyEmphasis`, `getFeatures`, uses `spine.sequenceId`
- `src/pangenomeService.js` — `getSpineFeatures`, `getAssemblyWalk`, consumes config, adds `sequenceId` to spine
- `src/igvCore/io/textFeatureSource.js` — `getFeatures`, `loadFeatures`
- `src/igvCore/io/featureFileReader.js` — `readFeatures`, `loadFeaturesWithIndex`
- `notes/genomics/genome-loading-architecture.md` — Overall genome loading flow
- `notes/genomics/local-custom-genome-testing.md` — Custom genome setup
- `public/hprc-project/hello-hprc.json` — Example data with node 5504+, assembly entries, sequence_ids

### IGV.js (reference implementation)

- `/Users/turner/IGVDevelopment/igv.js/js/locus.js` — Locus representation
- `/Users/turner/IGVDevelopment/igv.js/js/referenceFrame.js` — ReferenceFrame: chr, start, end, bpPerPixel
- `/Users/turner/IGVDevelopment/igv.js/js/trackViewport.js` — `loadFeatures()`: passes referenceFrame.chr, start, end to getFeatures
- `/Users/turner/IGVDevelopment/igv.js/js/feature/featureTrack.js` — `getFeatures(chr, start, end, bpPerPixel)`
- `/Users/turner/IGVDevelopment/igv.js/js/feature/textFeatureSource.js` — Feature source used for GFF3/BED
