# How to Map Annotation Track to Assembly Walk

This updated guide shows how to build **solid, monotonic, bi-directional mapping** between a 1D annotation track (bp) and your 3D pangenome graph rendered with Three.js—**even when some nodes are geometrically flipped or traversed in opposite senses**.

The core idea is to anchor each node’s parametric space to its actual **left neighbor → right neighbor** geometry. We do this once by choosing, per node, which endpoint (`t=0` or `t=1`) is the **entry** (closer to the left neighbor) and which is the **exit** (closer to the right neighbor). From there:

* **Track → Graph:** map bp → node via binary search → progress `u∈[0,1]` → oriented `t = entryT + u·(exitT−entryT)`.
* **Graph → Track:** map raw raycast `tRaw` back to `u = (tRaw−entryT)/(exitT−entryT)` → bp.

This stays monotonic in track space and visually correct across flipped nodes.

---

## Prereqs & Assumptions

* You obtain the spine for the selected assembly via `getSpineFeatures(assemblyKey)`.
  `spine.nodes` is in walk order and includes `{ id, bpStart, bpEnd }` with **monotonic** bp.
* Each node is rendered as a **ParametricLine** (subclass of `Line2`) exposing:

  ```ts
  getPointAt(t: number): THREE.Vector3   // t ∈ [0,1]
  ```
* You keep a registry:

  ```ts
  const nodeGeomMap: Map<string, ParametricLine>;
  ```
* You can provide a representative **center** for each node (e.g., your label position or a precomputed centroid). If you don’t have one, the builder below will fall back to `line.getPointAt(0.5)`.

---

## API Overview (what you’ll use)

1. `buildBpIndex(spine)` → `{ idx, bpMin, bpMax }`
2. `makeNodeRecordMap(bpIndex)` → `Map<nodeId, {bpStart,bpEnd,lengthBp}>`
3. `buildNodeEndpointMap(walkNodes, nodeGeomMap, nodeCenter)` → `Map<nodeId, {entryT,exitT}>`
4. `bpToNodeParam(bp, bpIndex, endpointMap, nodeGeomMap)` → `{ nodeId, t, xyz, u }`
5. `nodeRaycastTToBp(nodeId, tRaw, bpIndex, endpointMap, nodeRecordMap)` → `{ bp, u }`

(Advanced add-ons and tests appear later.)

---

## Code (drop-in)

### Tiny helpers

```js
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const d2 = (a, b) => { const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; return dx*dx + dy*dy + dz*dz; };
```

### 1) Build a bp index from the spine

```js
/**
 * Monotonic 1D index over spine nodes.
 */
function buildBpIndex(spine) {
  const idx = spine.nodes.map(n => ({
    id: n.id,
    bpStart: n.bpStart,
    bpEnd: n.bpEnd,
    lengthBp: Math.max(0, (n.bpEnd ?? 0) - (n.bpStart ?? 0)),
  }));
  const bpMin = idx.length ? idx[0].bpStart : 0;
  const bpMax = idx.length ? idx[idx.length - 1].bpEnd : 0;
  return { idx, bpMin, bpMax };
}

function makeNodeRecordMap(bpIndex) {
  const m = new Map();
  for (const n of bpIndex.idx) m.set(n.id, n);
  return m;
}
```

### 2) Anchor each node’s parametric endpoints to its neighbors

```js
/**
 * Decide, per node, which endpoint is ENTRY (toward left neighbor) and which is EXIT (toward right neighbor).
 * Ensures bp increases left→right on the track while the dot travels from left neighbor end to right neighbor end,
 * regardless of the line’s internal t-direction or inversions.
 *
 * @param {string[]} walkNodes                  // spine/walk order, e.g. spine.nodes.map(n => n.id)
 * @param {Map<string,{getPointAt:(t:number)=>THREE.Vector3}>} nodeGeomMap
 * @param {(id:string)=>THREE.Vector3} nodeCenter   // center for a node (fallback used if null)
 * @returns {Map<string,{entryT:0|1, exitT:0|1}>}
 */
function buildNodeEndpointMap(walkNodes, nodeGeomMap, nodeCenter) {
  const map = new Map();
  const endpoint = (id, t) => nodeGeomMap.get(id)?.getPointAt?.(t) ?? null;
  const center   = (id)    => nodeCenter(id) ?? nodeGeomMap.get(id)?.getPointAt?.(0.5) ?? null;

  for (let i = 0; i < walkNodes.length; i++) {
    const id = walkNodes[i];
    const prevId = i > 0 ? walkNodes[i - 1] : null;
    const nextId = i < walkNodes.length - 1 ? walkNodes[i + 1] : null;

    const p0 = endpoint(id, 0), p1 = endpoint(id, 1);
    let entryT = 0, exitT = 1;

    if (p0 && p1) {
      if (prevId && nextId) {
        const prevC = center(prevId), nextC = center(nextId);

        // ENTRY = endpoint closer to previous node’s center
        const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
        const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
        entryT = dPrev0 <= dPrev1 ? 0 : 1;

        // EXIT  = endpoint closer to next node’s center
        const dNext0 = nextC ? d2(p0, nextC) : Infinity;
        const dNext1 = nextC ? d2(p1, nextC) : Infinity;
        exitT = dNext0 <= dNext1 ? 0 : 1;

        // Degenerate case: both pick same end → force exit to the other end
        if (entryT === exitT) exitT = 1 - entryT;

      } else if (nextId) {
        // First node in window: choose EXIT toward next
        const nextC = center(nextId);
        const dNext0 = nextC ? d2(p0, nextC) : Infinity;
        const dNext1 = nextC ? d2(p1, nextC) : Infinity;
        exitT  = dNext0 <= dNext1 ? 0 : 1;
        entryT = 1 - exitT;

      } else if (prevId) {
        // Last node in window: choose ENTRY toward prev
        const prevC = center(prevId);
        const dPrev0 = prevC ? d2(p0, prevC) : Infinity;
        const dPrev1 = prevC ? d2(p1, prevC) : Infinity;
        entryT = dPrev0 <= dPrev1 ? 0 : 1;
        exitT  = 1 - entryT;
      }
    }

    map.set(id, { entryT, exitT });
  }

  return map;
}
```

### 3) Track → Graph

```js
/**
 * Map a track bp to a dot position on the graph.
 * Returns oriented t and the sampled xyz on the node’s ParametricLine.
 */
function bpToNodeParam(bp, bpIndex, endpointMap, nodeGeomMap) {
  const { idx } = bpIndex;
  if (!idx.length) return null;

  // Clamp into [first.bpStart, last.bpEnd)
  const first = idx[0], last = idx[idx.length - 1];
  if (bp < first.bpStart) bp = first.bpStart;
  if (bp >= last.bpEnd)   bp = last.bpEnd - 1e-9;

  // Binary search node where bpStart <= bp < bpEnd
  let lo = 0, hi = idx.length - 1, hit = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = idx[mid];
    if (bp < n.bpStart) hi = mid - 1;
    else if (bp >= n.bpEnd) lo = mid + 1;
    else { hit = mid; break; }
  }

  const n = idx[hit];
  const u = n.lengthBp ? clamp01((bp - n.bpStart) / n.lengthBp) : 0;

  const { entryT = 0, exitT = 1 } = endpointMap.get(n.id) ?? {};
  const t = entryT + u * (exitT - entryT);

  const line = nodeGeomMap.get(n.id);
  const xyz  = line?.getPointAt ? line.getPointAt(t) : null;

  return { nodeId: n.id, t, xyz, u };
}
```

### 4) Graph → Track

```js
/**
 * Map a raycast hit on a ParametricLine (nodeId, tRaw) back to bp on the track.
 * Use the hit xyz for the dot; this mapping is for semantics (scrubber position, tooltips).
 */
function nodeRaycastTToBp(nodeId, tRaw, bpIndex, endpointMap, nodeRecordMap) {
  const rec = nodeRecordMap.get(nodeId);
  if (!rec) return null;

  const { entryT = 0, exitT = 1 } = endpointMap.get(nodeId) ?? {};
  const denom = (exitT - entryT) || 1;       // avoid division by zero
  const u = clamp01((tRaw - entryT) / denom);
  const bp = rec.bpStart + u * (rec.lengthBp || 0);

  return { bp, u };
}
```

---

## Wiring Example

```js
// 1) Get monotonic spine for the selected assembly
const {spine} = pangenomeService.getSpineFeatures(assemblyKey);

// 2) Build indices
const bpIndex = buildBpIndex(spine);
const nodeRecordMap = makeNodeRecordMap(bpIndex);

// 3) Build endpoint map using scene geometry
const walkNodes = spine.nodes.map(n => n.id);
const endpointMap = buildNodeEndpointMap(walkNodes, nodeGeomMap);

// 4a) Track → Graph (hover/scrub)
function onTrackHover(bp) {
    const hit = bpToNodeParam(bp, bpIndex, endpointMap, nodeGeomMap);
    if (hit?.xyz) {
        dot.position.copy(hit.xyz);
        // Optional: tooltip with nodeId and hit.u.toFixed(3)
    }
}

// 4b) Graph → Track (raycast on ParametricLine)
function onRaycastHit({nodeId, tRaw, xyz}) {
    dot.position.copy(xyz); // true hit for visuals
    const mapped = nodeRaycastTToBp(nodeId, tRaw, bpIndex, endpointMap, nodeRecordMap);
    if (mapped) trackScrubber.setBp(mapped.bp);
}
```

---

## Advanced

### A) Seam Smoothing at Node Boundaries (anti-snap)

Blend positions across seams when bp is within a small pixel band of a node boundary.

```js
/**
 * Return a seam-smoothed dot position near node boundaries.
 * pxToBp: conversion factor (track pixels → bp). pxEpsilon: half-band in px to blend.
 */
function sampleSeamAware(bp, bpIndex, endpointMap, nodeGeomMap, pxToBp, pxEpsilon = 2) {
  const hit = bpToNodeParam(bp, bpIndex, endpointMap, nodeGeomMap);
  if (!hit?.xyz) return null;

  const bpBand = Math.max(1e-9, pxToBp * pxEpsilon);
  const { idx } = bpIndex;
  const i = idx.findIndex(n => n.id === hit.nodeId);
  if (i < 0) return hit.xyz;

  const n = idx[i];
  const atStart = bp - n.bpStart;
  const atEnd   = n.bpEnd - bp;

  // Near left boundary → blend prev.exit → curr.entry
  if (atStart < bpBand && i > 0) {
    const prev = idx[i - 1];
    const alpha = clamp01(atStart / bpBand);

    const prevEnds = endpointMap.get(prev.id) || { entryT: 0, exitT: 1 };
    const prevLine = nodeGeomMap.get(prev.id);
    const pA = prevLine.getPointAt(prevEnds.exitT);

    const ends = endpointMap.get(n.id) || { entryT: 0, exitT: 1 };
    const line = nodeGeomMap.get(n.id);
    const pB = line.getPointAt(ends.entryT);

    return pA.clone().lerp(pB, alpha);
  }

  // Near right boundary → blend curr.exit → next.entry
  if (atEnd < bpBand && i < idx.length - 1) {
    const next = idx[i + 1];
    const alpha = clamp01(atEnd / bpBand);

    const ends = endpointMap.get(n.id) || { entryT: 0, exitT: 1 };
    const line = nodeGeomMap.get(n.id);
    const pA = line.getPointAt(ends.exitT);

    const nextEnds = endpointMap.get(next.id) || { entryT: 0, exitT: 1 };
    const nextLine = nodeGeomMap.get(next.id);
    const pB = nextLine.getPointAt(nextEnds.entryT);

    return pA.clone().lerp(pB, 1 - alpha);
  }

  return hit.xyz;
}
```

**Use:** in your hover handler, swap `hit.xyz` with `sampleSeamAware(...)`.

---

### B) Quick Round-Trip Tests (confidence check)

```js
const EPS_BP = 1e-6;  // bp tolerance
const EPS_U  = 1e-4;  // within-node progress tolerance

function testTrackRoundTrip(bpIndex, endpointMap, nodeGeomMap) {
  const nodeMap = makeNodeRecordMap(bpIndex);
  const { bpMin, bpMax } = bpIndex;
  for (let i = 0; i < 400; i++) {
    const bp = bpMin + (bpMax - bpMin) * (i / 399);
    const hit = bpToNodeParam(bp, bpIndex, endpointMap, nodeGeomMap);
    const back = nodeRaycastTToBp(hit.nodeId, hit.t, bpIndex, endpointMap, nodeMap);
    if (!back || Math.abs(back.bp - bp) > EPS_BP) {
      console.warn("Track→Graph→Track mismatch", { i, bp, hit, back });
      return false;
    }
  }
  return true;
}

function testGraphRoundTrip(bpIndex, endpointMap, nodeGeomMap) {
  const nodeMap = makeNodeRecordMap(bpIndex);
  for (const n of bpIndex.idx) {
    for (const tRaw of [0, 0.25, 0.5, 0.75, 1]) {
      const back = nodeRaycastTToBp(n.id, tRaw, bpIndex, endpointMap, nodeMap);
      if (!back) return false;
      const hit  = bpToNodeParam(back.bp, bpIndex, endpointMap, nodeGeomMap);
      if (hit.nodeId !== n.id || Math.abs(hit.u - back.u) > EPS_U) {
        console.warn("Graph→Track→Graph mismatch", { n: n.id, tRaw, back, hit });
        return false;
      }
    }
  }
  return true;
}
```

---

### C) Optional: Edge-Aware Debug (dirIn / dirOut)

If you want to visualize inversions or sanity-check geometry anchoring, you can derive a **per-node incoming/outgoing direction** from your directed edges and chosen walk order. This is **not required** for the mapping itself, which is geometry-anchored, but it’s useful for overlays.

```js
// Your standard edge key helper
const getEdgeKey = (a, b) => `edge:${a}:${b}`;

/**
 * Build per-leg directions for the selected walk.
 * edges: Set/Map whose keys are edge:${a}:${b} for directed edges.
 */
function buildWalkLegs(walkNodes, edges) {
  const legs = [];
  for (let i = 0; i < walkNodes.length - 1; i++) {
    const a = walkNodes[i], b = walkNodes[i + 1];
    const fwd = edges.has(getEdgeKey(a, b));
    const rev = edges.has(getEdgeKey(b, a));
    let dir = 0, edgeKey;
    if (fwd && !rev) { dir = +1; edgeKey = getEdgeKey(a, b); }
    else if (rev && !fwd) { dir = -1; edgeKey = getEdgeKey(b, a); }
    else if (fwd && rev) { dir = +1; edgeKey = getEdgeKey(a, b); } // tie-break
    legs.push({ from: a, to: b, dir, edgeKey });
  }
  return legs;
}

/**
 * Convert legs → per-node (dirIn, dirOut). Useful for icons/overlays at flip nodes.
 */
function toNodeDirs(walkNodes, legs) {
  const nodeDirs = new Map();
  for (let i = 0; i < walkNodes.length; i++) {
    const dirIn  = i > 0 ? Math.sign(legs[i - 1].dir || 0) : 0;
    const dirOut = i < legs.length ? Math.sign(legs[i].dir || 0) : 0;
    nodeDirs.set(walkNodes[i], { dirIn, dirOut });
  }
  return nodeDirs;
}
```

You can mark nodes where `dirIn !== dirOut` with a small glyph (↺) to show strand flips.

---

## Notes & Tips

* **Monotonic by construction:** bp is guaranteed increasing along the spine. The geometry-anchored endpoints ensure the dot moves left→right across each node as bp increases—even when the node’s internal `t` runs “backwards” or the surrounding legs disagree.
* **Keep the raycast xyz:** For Graph→Track, use the hit’s xyz for visuals and only use the mapping for semantics (bp/scrubber/tooltip).
* **Performance:** Precompute is O(N). Track scrubs are O(log N). Raycast mapping is O(1). Cache `makeNodeRecordMap(bpIndex)` and, during scrubs, start the binary search near the last hit for near-O(1) behavior.
* **Centers:** If you don’t have a separate `nodeCenter(id)`, the fallback (`getPointAt(0.5)`) works surprisingly well. If your nodes are very curved or asymmetric, consider caching better centers (e.g., mean of sampled points or your label anchor).

---

That’s it. Plug these in and you’ll have **stable, monotonic, bi-directional mapping** across all datasets, including tricky inversions and flipped node parameterizations.
