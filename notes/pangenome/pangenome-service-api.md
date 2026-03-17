# PangenomeService v1.2 — API Reference

> Stable, deterministic core for loading a pangenome slice, extracting a **single linear assembly walk**, and building a **linearized spine** with bounded feature discovery.

---

## Class

### `new PangenomeService()`

Creates an empty service. Call `loadData(json)` before using other methods.

---

## Data loading

### `loadData(json, { assemblyKeyDelim = "#" } = {}) -> true`

Loads a dataset and builds internal indexes.

* **json.node**: `{[nodeId]: { name?, length?, assembly: [{assembly_name, haplotype, sequence_id}], ... }}`
* **json.edge**: `[{ starting_node, ending_node }, ...]` (directed)
* **json.sequence** *(optional)*: `{[nodeId]: "ACGT..."}` (used to infer `length` if missing)
* **assemblyKey** format: `"assembly_name#haplotype#sequence_id"` (delim customizable)

**Notes**

* Node IDs may include a sign suffix (`+`/`-`). The loader resolves aliases like `2912`/`2912+`.
* Edge keys are normalized internally as `edge:<from>:<to>`.
* Length fallback: `node.length ?? sequence.length ?? 0`.

### `listAssemblyKeys() -> string[]`

Returns all assembly keys present in the current dataset (sorted).

---

## Baseline / locus

### `setDefaultLocusStartBp(number) -> number`

Sets a baseline for projecting bp coordinates when building a spine.

### `getDefaultLocusStartBp() -> number`

Returns the current default baseline.

---

## Walks

### `getAssemblyWalk(assemblyKey, opts) -> { nodes: string[], edges: string[] }`

Returns a **single, linear, non-branching** path for the assembly.

**opts (all optional):**

* `startNodeId: string` — hard anchor candidate (must belong to the assembly).
* `startPolicy: "preferArrowEndpoint" | "forceFromNode" | "preferEndpoint"` (default `"preferArrowEndpoint"`)

  * **forceFromNode**: start at `startNodeId` inside the assembly component; simple path continues downstream.
  * **preferArrowEndpoint**: if no `startNodeId`, auto-pick a **directed source** (in-degree 0, out-degree >0) with the largest downstream bp-reach and start there.
  * **preferEndpoint**: legacy; if `startNodeId` is an endpoint but appears at tail, flip.
* `directionPolicy: "edgeFlow" | "asIs"` (default `"edgeFlow"`)

  * **edgeFlow**: orient path to maximize agreement with arrow directions (anchored starts are not flipped).

**Throws**

* If `startNodeId` is provided but not in the assembly-induced subgraph.

**Invariants**

* `edges.length === nodes.length - 1`.
* Deterministic for a given dataset and options.

---

## Spine + bounded features

### `getSpineFeatures(assemblyKey, assessOpts = {}, walkOpts = {}) -> { spine, events, offSpine, aborted }`

Builds a **linearized spine** (bp-projected) for an assembly and discovers nearby events (pills/bubbles/braids/dangling) within capped budgets.

**walkOpts**: passed straight to `getAssemblyWalk()` (see above).

**assessOpts (all optional; defaults shown):**

* Discovery toggles

  * `includeAdjacent = true` — allow same-anchor insertions (“pills”).
  * `allowMidSpineReentry = true` — allow detours to touch mid-spine nodes (enables “braids”).
  * `includeDangling = true` — include branches that don’t rejoin inside the window.
  * `includeOffSpineComponents = "none" | "summary" | "full"` (default `"none"`) — components never touching the spine.
* Sampling & bounds

  * `maxPathsPerEvent = 1` — number of alternate paths sampled per event (shortest only by default).
  * `maxRegionHops = 64`, `maxRegionNodes = 4000`, `maxRegionEdges = 4000` — region caps.
  * `operationBudget = 500000` — global guard to avoid stalls.
* Projection

  * `locusStartBp = getDefaultLocusStartBp()` — x-origin for bp projection.

**Return structure**

* `spine`:

  ```js
  {
    assemblyKey,
    nodes: [{ id, bpStart, bpEnd, lengthBp }, ...],
    edges: ["edge:a:b", ...],
    lengthBp // bpEnd(last) - bpStart(first)
  }
  ```
* `events`: array of:

  ```js
  {
    id: "L~R",
    type: "pill" | "simple_bubble" | "braid" | "dangling",
    anchors: { leftId: L, rightId: R, spanStart, spanEnd, refLenBp, orientation: "forward" },
    region: { nodes: string[], edges: string[], truncated: boolean },
    paths: [ { nodes: string[], edges: string[], altLenBp: number }, ... ],
    stats: { nPaths, minAltLenBp, maxAltLenBp, truncatedPaths, removedSpineLeg: true },
    relations: { parentId: null, childrenIds: [], overlapGroup: null, sameAnchorGroup: null }
  }
  ```
* `offSpine`: list of off-spine components (empty unless requested).
* `aborted`: `true` if the global budget was exhausted mid-way.

**Invariants**

* `spine.nodes` is always linear and in bp-order.
* Event `paths` exclude the direct spine leg; pills are reported as same-anchor events with `refLenBp === 0`.

---

## Complexity & determinism

* All graph searches are **BFS-based** (linear in visited nodes/edges) with **hard caps**.
* Start selection is deterministic: arrow-source scoring → tie-break by total bp → stable id ordering.
* No dependence on JSON order.

---

## Errors & edge cases

* `loadData` must be called before any other method.
* `startNodeId` must belong to the assembly or an error is thrown.
* If the assembly has no nodes in the slice, methods return empty structures (no throw).

---

# Usage Guide

## Quick start

```js
import PangenomeService from "./PangenomeService.js";

const svc = new PangenomeService();
svc.loadData(json);                  // your graph slice
svc.setDefaultLocusStartBp(0);       // optional projection baseline

// 1) A linear walk (auto arrow-consistent start)
const walk = svc.getAssemblyWalk("GRCh38#0#chr1", {
  startPolicy: "preferArrowEndpoint",
  directionPolicy: "edgeFlow"
});

// 2) The same, but anchored at a known entry node
const anchored = svc.getAssemblyWalk("GRCh38#0#chr1", {
  startNodeId: "2912+",
  startPolicy: "forceFromNode",
  directionPolicy: "edgeFlow"
});

// 3) Linearized spine + bounded feature discovery
const features = svc.getSpineFeatures(
  "GRCh38#0#chr1",
  {
    includeOffSpineComponents: "none",
    maxPathsPerEvent: 1,
    maxRegionHops: 64,
    maxRegionNodes: 4000,
    maxRegionEdges: 4000,
    operationBudget: 500000,
    locusStartBp: 0
  },
  {
    startPolicy: "preferArrowEndpoint",
    directionPolicy: "edgeFlow"
  }
);
```

## Rendering hooks (three.js integration hints)

* **Spine**: iterate `features.spine.nodes` in order; lay each segment from `bpStart`→`bpEnd`.
* **Events**:

  * **pill**: draw an attached pill/teardrop centered near `anchors.spanStart` (since `spanStart === spanEnd`).
  * **simple\_bubble**: arc from `spanStart` to `spanEnd` above the spine.
  * **braid**: like bubble, but the `region` includes mid-spine contacts—style accordingly.
  * **dangling**: a branch starting at `L` that doesn’t reach `R`—draw as a one-sided detour.

## Choosing a start node automatically (recommended)

If you omit `startNodeId` and use `startPolicy: "preferArrowEndpoint"`, the service:

1. builds the **directed** assembly subgraph,
2. finds **sources** (in-degree 0),
3. picks the one with **largest downstream bp-reach**,
4. returns the simple path starting there.

This avoids “going upstream” and doesn’t rely on arbitrary JSON order.

## Anchoring explicitly

If a UI action points at a node that is known to be the “entry”:

```js
const walk = svc.getAssemblyWalk(key, {
  startNodeId: hoveredNodeId,
  startPolicy: "forceFromNode",
  directionPolicy: "edgeFlow"
});
```

> Throws if `hoveredNodeId` is not on that assembly—catch and fall back to `preferArrowEndpoint`.

## Performance tips

* Keep `operationBudget` conservative for interactivity (e.g., `3e5`–`5e5`).
* For large, branchy windows, cap `maxRegionHops` (48–64) and `maxRegionNodes/Edges`.
* Use `includeOffSpineComponents: "none"` in UI mode.

## Sanity checks (helpful during testing)

```js
// linearity
console.assert(walk.edges.length === walk.nodes.length - 1);

// bp monotonicity
const sn = features.spine.nodes;
for (let i=1;i<sn.length;i++) {
  console.assert(sn[i-1].bpEnd <= sn[i].bpStart, "non-monotonic bp");
}
```

## Common pitfalls

* **“First node in JSON” is not a safe start.** Use `preferArrowEndpoint` or `forceFromNode`.
* **Anchored starts won’t flip** for edge orientation. If you want edge-flow flipping, don’t force an anchor.
* **Node signs**: the loader resolves `2912`, `2912+`, `2912-` to the canonical in-file ID. Use the IDs from `svc.getAssemblyWalk()`/`getSpineFeatures()` when coloring.

---

If you want, I can bundle these two docs into separate `API.md` and `USAGE.md` files with your project’s headings and put a short “version history” stub at the top.
