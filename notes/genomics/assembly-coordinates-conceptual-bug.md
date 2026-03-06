# Assembly Coordinates Conceptual Bug

This document describes a design inconsistency in PGB: the per-assembly spine mixes assembly-specific structure with reference-specific coordinates. An **implemented fix** addresses the critical part—the sequence ID and coordinate origin—while keeping the design flexible for future assembly-specific start data.

---

## Summary

The spine is built per-assembly (each assembly has its own walk and spine in `assemblyWalkMap`), but the coordinates within it were originally in **reference space** for all assemblies. The spine was assembly-specific in terms of *which nodes* it contains and *in what order*, but not in *coordinates* (bpStart, bpEnd) or *sequence ID*.

The implemented fix:

1. **GenomicService** now computes per-assembly values and passes them explicitly in the config: `locusStartBp` (locus start for reference assemblies, 0 for custom as placeholder) and `sequenceId` (from the assembly key).

2. **PangenomeService** consumes these values from the config; no decision logic. The spine includes `sequenceId` for downstream use.

3. **AnnotationRenderService** uses `spine.sequenceId` instead of `locus.chr` for the feature query.

For reference assemblies, the spine coordinates remain in reference space (chr1 positions). For custom assemblies, the origin is 0 (placeholder); proper assembly-specific starts are future work. The design keeps all coordinate-selection logic in GenomicService so the fix can evolve when that data becomes available.

---

## Where the Spine Is Built

The spine is constructed in `PangenomeService.getSpineFeatures()` and cached in `GenomicService.assemblyWalkMap`:

```
src/genomicService.js  — computes per-assembly config (locusStartBp, sequenceId), calls getSpineFeatures
src/pangenomeService.js — getSpineFeatures(assemblyKey, assessOpts, walkOpts)
```

For each assembly, the spine is built from the assembly walk and the **per-assembly config**:

```javascript
// Spine with bp coords — locusStartBp and sequenceId come from assessOpts (GenomicService)
let x = Number(locusStartBp) || 0;   // reference: locus start; custom: 0
const spineNodes = [];
for (const id of path.nodes) {
    const len = this.graph.nodes.get(id)?.lengthBp || 0;
    spineNodes.push({ id, bpStart: x, bpEnd: x + len, lengthBp: len });
    x += len;
}
const spine = { assemblyKey, nodes: spineNodes, edges: ..., lengthBp: ..., sequenceId };
```

`locusStartBp` and `sequenceId` are provided by GenomicService in the assessment config. GenomicService determines reference vs. custom by checking `sequenceId === this.locus.chr`.

---

## The Inconsistency (Partially Addressed)

| Aspect | Original behavior | Implemented behavior |
|--------|-------------------|----------------------|
| Node order | Assembly-specific ✓ | Assembly-specific ✓ |
| Sequence ID | Always from locus (chr1) | Per-assembly: `spine.sequenceId` from assembly key ✓ |
| Origin (locusStartBp) | Same for all (reference locus) | Reference: locus start; Custom: 0 ✓ |
| Spine coordinates (bpStart, bpEnd) | Reference (chr1) | Reference: chr1; Custom: 0-based (placeholder) |

The sequence ID and origin are now assembly-specific. The spine coordinates for custom assemblies use a 0-based placeholder until proper assembly-specific offsets (from the walk and node metadata) are available. See `annotation-track-custom-genome-coordinates.md` for the algorithm.

---

## Downstream Impact

Any code that consumes the spine and assumes assembly-specific coordinates:

- **AnnotationRenderService** — Now uses `spine.sequenceId` for the feature query. For custom genomes, this queries `CM094060.1:0-35995` (or similar) instead of `chr1:...`. The sequence ID is correct; the start/end are placeholder until proper assembly-specific offsets exist.

- **Other potential consumers** — Should use `spine.sequenceId` when they need the assembly's contig. For layout (relative position along the spine), the existing bpStart/bpEnd work for both reference and custom.

---

## Why This Happened

A natural design choice: the view has a single locus (reference coordinates). The spine is a linearization of "what we're looking at" along the assembly's path. Using the locus start as the origin gives a monotonic bp parameter that works for track layout—mapping position along the spine to pixels.

The mistake: treating that layout parameter as the coordinate system for *all* downstream uses. For feature retrieval, we need assembly-specific sequence ID and (eventually) assembly-specific coordinates. The implemented fix addresses the sequence ID and origin; proper assembly-specific start/end remain future work.

---

## Relation to Other Documents

- **annotation-track-custom-genome-coordinates.md** — Describes the bug from the annotation track perspective, the implemented solution (GenomicService config, spine.sequenceId), and the future algorithm for assembly-specific offsets.

---

## References

- `src/genomicService.js` — Per-assembly config: `locusStartBp`, `sequenceId`, reference vs. custom logic
- `src/pangenomeService.js` — `getSpineFeatures`, consumes config, adds `sequenceId` to spine
- `src/annotationRenderService.js` — `handleAssemblyEmphasis`, uses `spine.sequenceId` for feature query
- `notes/genomics/annotation-track-custom-genome-coordinates.md` — Annotation track coordinate system and fix
