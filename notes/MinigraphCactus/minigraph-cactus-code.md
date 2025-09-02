Awesome—here are the updated, drop-in JS helpers using **your** terminology (Node / Node Run / Rendered Line / Component). They assume:

* Each **Node** has `{ id, points: Vector3[~32], bp: number }`.
* **Edges** are only used for traversal: `{ a, b }` (undirected).
* A **Rendered Line** is the concatenation of a **Node Run** into one `ParametricLine`.
* Ortho camera math from the reference doc.

---

# 0) Small utilities

```js
const EPS_SEAM = 1e-3;

function buildAdjacency(edges) {
  const nbrs = new Map();
  for (const {a, b} of edges) {
    if (!nbrs.has(a)) nbrs.set(a, new Set());
    if (!nbrs.has(b)) nbrs.set(b, new Set());
    nbrs.get(a).add(b);
    nbrs.get(b).add(a);
  }
  return nbrs;
}

function degree(nbrs, id) { return nbrs.get(id)?.size ?? 0; }
function edgeKey(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }

function endpoints(node){
  const P = node.points;
  return { start: P[0], end: P[P.length-1] };
}

/** Append node.points to outPoints, reversing if needed so it meets prevEnd. */
function appendOriented(prevEnd, node, outPoints, eps=EPS_SEAM) {
  const { start, end } = endpoints(node);
  // Which endpoint is closer to prevEnd?
  const asIsDist = prevEnd.distanceToSquared(start);
  const revDist  = prevEnd.distanceToSquared(end);
  const src = (asIsDist <= revDist) ? node.points : node.points.slice().reverse();

  // Avoid duplicate seam vertex
  const startIndex = src[0].distanceTo(prevEnd) < eps ? 1 : 0;
  for (let i = startIndex; i < src.length; i++) outPoints.push(src[i].clone());
  return src[src.length-1]; // new prevEnd
}
```

---

# 1) Components (connected sets of Nodes)

```js
/** Return array of Components, each as { nodeIds: Set<string> } */
function buildComponents(nodesById, edges){
  const nbrs = buildAdjacency(edges);
  const seen = new Set();
  const comps = [];

  for (const id of Object.keys(nodesById)) {
    if (seen.has(id)) continue;
    // BFS/DFS
    const q = [id];
    const comp = new Set([id]);
    seen.add(id);
    while (q.length) {
      const u = q.pop();
      for (const v of (nbrs.get(u) ?? [])) {
        if (!seen.has(v)) { seen.add(v); comp.add(v); q.push(v); }
      }
    }
    comps.push({ nodeIds: comp });
  }
  return comps;
}
```

---

# 2) Discover **Node Runs** by traversal (degree-2 chains)

```js
/**
 * Find Node Runs inside a Component.
 * Node Run = maximal chain whose INTERIOR Nodes have degree==2.
 * Endpoints are Junction Nodes (deg!=2) or tips, or it's a closed loop.
 * Returns array of runs: { nodeIds: string[], closed: boolean }
 */
function buildNodeRunsForComponent(nodesById, edges, component){
  const nbrs = buildAdjacency(edges);
  const inComp = new Set(component.nodeIds);
  const visitedEdge = new Set();
  const seenNode = new Set();
  const runs = [];

  // Pass 1: seed from Junction Nodes (deg != 2)
  for (const id of inComp) {
    const d = degree(nbrs, id);
    if (d === 2) continue; // interior nodes handled during walks
    for (const nbr of (nbrs.get(id) ?? [])) {
      if (!inComp.has(nbr)) continue;
      const ek = edgeKey(id, nbr);
      if (visitedEdge.has(ek)) continue;

      // Walk forward through interior nodes
      const chain = [];
      let prev = id;
      let cur = nbr;
      visitedEdge.add(ek);

      if (!inComp.has(cur)) continue;
      chain.push(cur);
      seenNode.add(cur);

      while (degree(nbrs, cur) === 2) {
        // choose the neighbor that's not prev
        const it = nbrs.get(cur)[Symbol.iterator]();
        const n1 = it.next().value, n2 = it.next().value;
        const nxt = (n1 === prev) ? n2 : n1;
        if (!inComp.has(nxt)) break;

        visitedEdge.add(edgeKey(cur, nxt));
        prev = cur;
        cur = nxt;

        if (degree(nbrs, cur) !== 2) break; // stop before junction
        chain.push(cur);
        seenNode.add(cur);
      }

      if (chain.length) runs.push({ nodeIds: chain, closed: false });
    }
  }

  // Pass 2: leftover interior nodes form closed loops
  for (const id of inComp) {
    if (seenNode.has(id)) continue;
    if (degree(nbrs, id) !== 2) continue;

    // Walk cycle
    const cycle = [];
    let prev = id;
    let cur = [...(nbrs.get(id) ?? [])][0];
    const startEdge = edgeKey(prev, cur);
    visitedEdge.add(startEdge);
    cycle.push(id);  // include seed in the cycle chain
    seenNode.add(id);

    while (cur !== id) {
      cycle.push(cur);
      seenNode.add(cur);
      const it = nbrs.get(cur)[Symbol.iterator]();
      const n1 = it.next().value, n2 = it.next().value;
      const nxt = (n1 === prev) ? n2 : n1;
      visitedEdge.add(edgeKey(cur, nxt));
      prev = cur; cur = nxt;
    }
    runs.push({ nodeIds: cycle, closed: true });
  }

  return runs;
}

/** Convenience: build Node Runs for all Components */
function buildAllNodeRuns(nodesById, edges){
  const components = buildComponents(nodesById, edges);
  const allRuns = [];
  for (const comp of components){
    const runs = buildNodeRunsForComponent(nodesById, edges, comp);
    allRuns.push(...runs);
  }
  return allRuns; // array of { nodeIds[], closed }
}
```

---

# 3) Concatenate a **Node Run** → one **Rendered Line**

```js
/**
 * Concat a Node Run into one Rendered Line (ParametricLine).
 * - Orients each Node to meet the previous endpoint (reverse if needed).
 * - Builds a Run Index: per original Node, its [t0,t1] on the final line,
 *   plus bpStart/bpEnd (cumulative bp).
 * Returns:
 * {
 *   id,                     // string
 *   nodeIds: string[],      // ordered
 *   points: Vector3[],      // concatenated vertices
 *   parametricLine,         // new ParametricLine(points, { closed })
 *   runIndex: [{ nodeId, t0, t1, bpStart, bpEnd }],
 *   closed: boolean
 * }
 */
function concatAsParametricLine(nodeRun, nodesById, ParametricLineCtor, opts={}){
  const { includeEndpoints = true } = opts; // (reserved if you ever want to drop junctions)

  const ids = nodeRun.nodeIds.slice(); // ordered
  if (!ids.length) throw new Error('empty Node Run');

  // Build concatenated vertex list
  const points = [];
  // Seed with the first node as-is
  let first = nodesById[ids[0]];
  for (const p of first.points) points.push(p.clone());
  let prevEnd = points[points.length-1];

  // Append subsequent nodes, oriented
  for (let k=1; k<ids.length; k++) {
    const node = nodesById[ids[k]];
    prevEnd = appendOriented(prevEnd, node, points, EPS_SEAM);
  }

  // Build cumulative geometric length to parametrize t by arc-length
  const geomLen = new Float32Array(points.length);
  let acc = 0;
  geomLen[0] = 0;
  for (let i=1; i<points.length; i++){
    acc += points[i].distanceTo(points[i-1]);
    geomLen[i] = acc;
  }
  const totalLen = Math.max(acc, 1e-9);
  const tAtVert = new Float32Array(points.length);
  for (let i=0; i<points.length; i++) tAtVert[i] = geomLen[i] / totalLen;

  // Build cumulative bp at Node boundaries (node granularity)
  const cumBp = new Float64Array(ids.length + 1);
  cumBp[0] = 0;
  for (let i=0; i<ids.length; i++) cumBp[i+1] = cumBp[i] + (nodesById[ids[i]].bp ?? 0);

  // Map each source Node to [t0,t1] on the concatenated line (by vertex count proportion).
  // We assume each Node contributes its full 32 vertices; we infer the boundary indices by append logic:
  const boundaryVertIdx = []; // inclusive start indices per node in 'points'
  {
    // Reconstruct boundaries by walking again (cheap)
    boundaryVertIdx.push(0);
    let prev = first.points[first.points.length-1];
    let cursor = first.points.length;
    for (let k=1; k<ids.length; k++){
      const node = nodesById[ids[k]];
      const { start, end } = endpoints(node);
      const asIsDist = prev.distanceToSquared(start);
      const revDist  = prev.distanceToSquared(end);
      const contrib = (asIsDist <= revDist) ? node.points.length : node.points.length; // length is same either way
      // seam may have merged one vertex; detect by distance
      const seamMerged = points[cursor - 1].distanceTo(
        (asIsDist <= revDist) ? node.points[0] : node.points[node.points.length-1]
      ) < EPS_SEAM;
      const added = contrib - (seamMerged ? 1 : 0);
      boundaryVertIdx.push(cursor);
      cursor += added;
      prev = points[cursor-1];
    }
  }

  const runIndex = [];
  for (let i=0; i<ids.length; i++){
    const i0 = boundaryVertIdx[i];
    const i1 = (i+1 < boundaryVertIdx.length) ? boundaryVertIdx[i+1] - 1 : (points.length - 1);
    const t0 = tAtVert[Math.max(i0, 0)];
    const t1 = tAtVert[Math.max(i1, 0)];
    runIndex.push({
      nodeId: ids[i],
      t0, t1,
      bpStart: cumBp[i],
      bpEnd:   cumBp[i+1]
    });
  }

  // Construct your ParametricLine
  const parametricLine = new ParametricLineCtor(points, { closed: !!nodeRun.closed });

  return {
    id: ids.join('→'),
    nodeIds: ids,
    points,
    parametricLine,
    runIndex,
    closed: !!nodeRun.closed,
    tAtVert
  };
}
```

---

# 4) Ortho **pixels per segment** and `Cpx` (for LOD)

```js
function getDrawingBufferSize(renderer){
  const v = new THREE.Vector2();
  renderer.getDrawingBufferSize(v);
  return { Wpx: v.x, Hpx: v.y };
}

function orthoScales(camera, renderer){
  const { Wpx, Hpx } = getDrawingBufferSize(renderer);
  const Wworld = (camera.right - camera.left) / camera.zoom;
  const Hworld = (camera.top - camera.bottom) / camera.zoom;
  return { Sx: Wpx / Wworld, Sy: Hpx / Hworld };
}

/**
 * Compute cumulative pixel arc-length along a Rendered Line under an ortho camera.
 * object3D = the mesh/object that holds the line (for model matrix).
 * Returns Float32Array Cpx with length == points.length.
 */
function computeCumPixelLengthOrtho(renderedLine, object3D, camera, renderer){
  const { Sx, Sy } = orthoScales(camera, renderer);
  const mv = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, object3D.matrixWorld);
  const P = renderedLine.points;

  const Cpx = new Float32Array(P.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  a.copy(P[0]).applyMatrix4(mv);
  Cpx[0] = 0;

  for (let i=1; i<P.length; i++){
    b.copy(P[i]).applyMatrix4(mv);
    const dx = (b.x - a.x) * Sx;
    const dy = (b.y - a.y) * Sy;
    const dpx = Math.hypot(dx, dy);
    Cpx[i] = Cpx[i-1] + dpx;
    a.copy(b);
  }
  return Cpx;
}
```

---

# 5) **Pixel Runs** (LOD bins) along a Rendered Line

```js
/**
 * Build Pixel Runs: contiguous intervals that are at least pMinPx pixels long.
 * Returns [{ t0, t1, pxSpan, bpSpan, nodeIds: [...]}]
 */
function makePixelRuns(renderedLine, Cpx, pMinPx = 1.5){
  const runs = [];
  const tAtVert = renderedLine.tAtVert;
  const n = Cpx.length;

  let i0 = 0;
  while (i0 < n-1) {
    const px0 = Cpx[i0];
    let i1 = i0 + 1;
    while (i1 < n && (Cpx[i1] - px0) < pMinPx) i1++;
    if (i1 >= n) i1 = n - 1;

    const t0 = tAtVert[i0];
    const t1 = tAtVert[i1];
    const pxSpan = Cpx[i1] - Cpx[i0];

    // derive bpSpan by interpolating over runIndex boundaries
    const bpSpan = bpSpanFromTInterval(renderedLine.runIndex, t0, t1);

    // collect nodeIds overlapped (optional but handy)
    const nodeIds = nodeIdsFromTInterval(renderedLine.runIndex, t0, t1);

    runs.push({ t0, t1, pxSpan, bpSpan, nodeIds });
    i0 = i1;
  }
  return runs;
}

function bpSpanFromTInterval(runIndex, t0, t1){
  // Sum overlaps with each node’s [t0,t1], linear interpolation of bp
  let bp = 0;
  for (const r of runIndex){
    const a0 = Math.max(t0, r.t0);
    const a1 = Math.min(t1, r.t1);
    if (a1 <= a0) continue;
    const frac = (a1 - a0) / (r.t1 - r.t0 || 1e-9);
    bp += frac * (r.bpEnd - r.bpStart);
  }
  return bp;
}

function nodeIdsFromTInterval(runIndex, t0, t1){
  const ids = [];
  for (const r of runIndex){
    if (r.t1 <= t0 || r.t0 >= t1) continue;
    ids.push(r.nodeId);
  }
  return ids;
}
```

---

# 6) Optional: local `bpPerPixel` at a given `t`

```js
/**
 * Estimate local bp/px around param t using a ~6px window.
 */
function bpPerPixelAtT(renderedLine, Cpx, t, pxWindow = 6){
  const tAtVert = renderedLine.tAtVert;
  // nearest vertex
  let idx = 0;
  // binary search for speed
  let lo = 0, hi = tAtVert.length-1;
  while (lo <= hi){
    const mid = (lo+hi) >> 1;
    if (tAtVert[mid] < t) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  let i0 = idx, i1 = idx;
  while (i0>0 && (Cpx[i1]-Cpx[i0]) < pxWindow) i0--;
  while (i1<Cpx.length-1 && (Cpx[i1]-Cpx[i0]) < pxWindow) i1++;
  const bp = bpSpanFromTInterval(renderedLine.runIndex, tAtVert[i0], tAtVert[i1]);
  const px = Math.max(Cpx[i1] - Cpx[i0], 1e-6);
  return bp / px;
}
```

---

## Typical usage

```js
// 1) Build Node Runs from your minigraph(-cactus) graph
const nodeRuns = buildAllNodeRuns(nodesById, edges);

// 2) Concat each into a Rendered Line (ParametricLine)
const renderedLines = nodeRuns.map(run =>
  concatAsParametricLine(run, nodesById, ParametricLine /* your ctor */)
);

// 3) On zoom/resize: update Cpx and Pixel Runs
for (const rl of renderedLines) {
  rl.Cpx = computeCumPixelLengthOrtho(rl, lineObject3D, camera, renderer);
  rl.pixelRuns = makePixelRuns(rl, rl.Cpx, /* pMinPx */ 1.5);
}

// 4) Render one ParametricLine per Rendered Line.
//    Use rl.pixelRuns for coloring/labels/instanced markers.
// 5) Picking: raycast → t → consult rl.runIndex (and/or rl.pixelRuns).
```

---

If you want, I can also supply a tiny `ParametricLine` subclass wrapper that consumes `{points, tAtVert}` directly, or a shader stub that samples a 1D LUT by `t` so Pixel Runs become a single texture lookup.
