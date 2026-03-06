# Assembly Coordinates Conceptual Bug

This document describes a deeper design inconsistency in PGB: the per-assembly spine mixes assembly-specific structure with reference-specific coordinates. The bug is not confined to the annotation render service—it originates in how the spine is built.

---

## Summary

The spine is built per-assembly (each assembly has its own walk and spine in `assemblyWalkMap`), but the coordinates within it are in **reference space**. The spine is only assembly-specific in terms of *which nodes* it contains and *in what order*. The *coordinates* (bpStart, bpEnd) are reference coordinates. This mixed design causes downstream consumers (e.g., AnnotationRenderService) to use the wrong coordinate system when fetching features for custom genomes.

---

## Where the Spine Is Built

The spine is constructed in `PangenomeService.getSpineFeatures()` and cached in `GenomicService.assemblyWalkMap`:

```
src/pangenomeService.js — getSpineFeatures(assemblyKey, assessOpts, walkOpts)
src/genomicService.js  — calls getSpineFeatures, stores in assemblyWalkMap
```

For each assembly, the spine is built from the assembly walk (node order) and the locus:

```javascript
// Spine with bp coords
let x = Number(locusStartBp) || 0;   // ← reference locus (chr1)
const spineNodes = [];
for (const id of path.nodes) {
    const len = this.graph.nodes.get(id)?.lengthBp || 0;
    spineNodes.push({ id, bpStart: x, bpEnd: x + len, lengthBp: len });
    x += len;
}
```

`locusStartBp` comes from `this.locus.startBP` in GenomicService—the reference locus (e.g., chr1:25240000–25460000). So every assembly's spine uses the same reference coordinate system.

---

## The Inconsistency

| Aspect | Current behavior | What "per-assembly spine" implies |
|--------|------------------|-----------------------------------|
| Node order | Assembly-specific ✓ | Assembly-specific ✓ |
| Coordinates (bpStart, bpEnd) | Reference (chr1) | Assembly-specific (per-contig) |

The spine is assembly-specific in **structure** (which nodes, walk order) but not in **coordinates**. A consumer that assumes "this spine represents assembly X" might reasonably expect the coordinates to be in assembly X's coordinate system. They are not.

---

## Downstream Impact

Any code that consumes the spine and assumes assembly-specific coordinates will be wrong:

- **AnnotationRenderService** — Uses `chr` from locus and `bpStart`/`bpEnd` from the spine for feature retrieval. For custom genomes, this queries chr1:bpStart–bpEnd against a GFF3 that uses contigs like CM094060.1. No match.

- **Other potential consumers** — Any future code that treats spine coordinates as assembly coordinates will inherit the same bug.

The bug manifests in AnnotationRenderService, but the root cause is the mixed coordinate design in the spine itself.

---

## Why This Happened

A natural design choice: the view has a single locus (reference coordinates). The spine is a linearization of "what we're looking at" along the assembly's path. Using the locus start as the origin gives a monotonic bp parameter that works for track layout—mapping position along the spine to pixels.

The mistake: treating that layout parameter as the coordinate system for *all* downstream uses. For feature retrieval, we need assembly-specific coordinates. The spine doesn't provide them.

---

## Relation to Other Documents

- **annotation-track-custom-genome-coordinates.md** — Describes the bug from the annotation track perspective: wrong coordinates passed to `getFeatures`. This document explains why those coordinates are wrong: the spine itself is built in reference space.

---

## Possible Fix Directions

1. **Make the spine assembly-specific** — Extend spine nodes in `getSpineFeatures` with assembly-specific coordinates (sequence_id, asmStart, asmEnd) derived from the walk and node metadata. Keep a separate layout parameter (reference bp or normalized 0–1) for track rendering if needed.

2. **Two coordinate systems in the spine** — Keep reference-based bpStart/bpEnd for layout (monotonic track parameter) and add assembly-specific ranges for feature retrieval. Spine nodes would carry both.

3. **Unify on assembly coordinates** — Use assembly-specific coordinates throughout for that assembly's spine. Layout would need to work in per-contig or merged assembly space instead of reference space.

---

## References

- `src/pangenomeService.js` — `getSpineFeatures`, spine coordinate calculation
- `src/genomicService.js` — `locus.startBP`, `assemblyWalkMap`
- `src/annotationRenderService.js` — `handleAssemblyEmphasis`, consumes spine for feature query
- `notes/genomics/annotation-track-custom-genome-coordinates.md` — Annotation track coordinate system and fix approach
