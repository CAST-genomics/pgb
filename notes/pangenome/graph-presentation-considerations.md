# Visual Fidelity vs. Presentation in Pangenome Graphs

*A short brief for developers and genomic researchers*

---

## 1) The core issue

Most pangenome JSON we’ve used lists **assemblies on nodes**, not **explicit paths/edges per assembly**.
When explicit paths are missing, any single “spine” we draw for an assembly is an **inference**:

1. Build the **assembly-induced subgraph**: all nodes that carry the assembly key.
2. Pick a **single simple path** through that subgraph (we choose the *longest* by bp).
3. Orient it to match **edge directions** (edge-flow vote), optionally **trim tiny leaf spurs** at the ends for readability.

> We never fabricate edges or reverse arrows, but step (3) *hides* real nodes to make a browser-like trunk. That’s presentation, not a change of semantics.

---

## 2) Two display modes (recommendation)

### A. Truth Mode (raw)

* Show the entire **assembly-induced subgraph** (all nodes with the key and all real edges among them).
* Exposes real branches, pills, braids, dangling pieces.
* No trimming, no path choice needed.

### B. Presentation Mode (spine)

* Show **one** linear simple path (our “chosen walk”) as the **spine**.
* Options:

  * `directionPolicy: "edgeFlow"` (align with arrow directions)
  * `trimLeafEnds: true`, with `leafEndNodesMax` or `leafEndBpMax` (hide short spurs that rejoin the trunk)

> Keep a one-click toggle between modes. Presentation mode gives a clean browser-like track; Truth mode preserves full structure.

---

## 3) Provenance & transparency (what to surface)

For every spine you render, attach a tiny “why this path?” report:

* **Endpoints chosen** (node IDs)
* **Edge-flow score** (forward vs reverse)
* **Trimmed prefix/suffix** (node IDs, bp) if trimming was on
* **Ambiguity**: number of equally long candidates (if tie)
* **Extras**: count of nodes carrying the key that are *not* on the spine (`offSpineKeyed`)

This keeps viewers aware when the spine is a **model** rather than a recorded path.

---

## 4) What is semantic vs. presentation?

| Aspect             | Semantic (truth)                 | Presentation (spine)                                           |
| ------------------ | -------------------------------- | -------------------------------------------------------------- |
| Nodes & edges      | From data as-is                  | Subset along one simple path                                   |
| Edge direction     | Preserved                        | Preserved; orientation voted by edge flow                      |
| Off-spine branches | Visible                          | Hidden or de-emphasized                                        |
| Leaf spurs         | Visible                          | Optionally trimmed (hidden)                                    |
| Coordinates        | From chosen path (bp cumulative) | Same; off-spine features use **projected span** onto the spine |

> **Never** create edges that don’t exist. Trimming may **hide** nodes; it must **not** add connections.

---

## 5) How this looks in code (PangenomeService)

**Single linear spine (presentation):**

```js
const key = "GRCh38#0#chr1";
const { path } = svc.getChosenWalk(key, {
  directionPolicy: "edgeFlow",
  trimLeafEnds: true,     // presentation choice
  leafEndNodesMax: 2      // or leafEndBpMax: 2000
});
// Render exactly path.nodes & path.edges
```

**Full feature set (for linearized rendering or analysis):**

```js
const { spine, events, offSpine } = svc.getSpineFeatures(
  key,
  { includeAdjacent: true, allowMidSpineReentry: true, includeDangling: true,
    includeOffSpineComponents: true, nestRegions: "shallow", locusStartBp: locus.start },
  { directionPolicy: "edgeFlow", trimLeafEnds: true, leafEndNodesMax: 2 }
);
```

**Truth mode (raw):**

```js
// draw the entire assembly-induced subgraph:
const { adj, components } = svc._buildInducedForAssembly(key); // or expose a public wrapper
// render all nodes that carry the key plus all real edges among them
```

---

## 6) UI checklist

* Toggle: **Truth (raw)** ↔ **Spine (trimmed)**
* Badge: “Spine (trimmed 2 nodes, 1.1 kb)” when trimming is on
* Tooltip/side panel: show provenance (endpoints, edge-flow score, trimmed nodes)
* Optional hover overlay: ghost the trimmed leaf segments
* Warning chip when `offSpineKeyed > 0`: “This assembly has off-spine branches; switch to Truth.”

---

## 7) When a “linear spine” still looks wrong

* **Short spur captured at an endpoint**: enable `trimLeafEnds` with a conservative threshold.
* **Branch still visible**: confirm you render **only** `path.edges`, not “all edges between colored nodes”.
* **Direction backwards**: ensure `directionPolicy: "edgeFlow"` or supply an endpoint `startNodeId`.

---

## 8) Best path to zero heuristics

Ask data providers to include **explicit per-assembly paths** (node+edge lists) in the export (e.g., GBZ/ODGI paths).
When paths are present, render them **as recorded**—no inference, no trimming required.

---

## 9) Takeaways

* We are not making “pretty pictures” detached from data; we apply a **documented, minimal presentation layer** only when explicit paths are absent.
* Keeping an always-available **Truth mode** and a clear provenance report preserves scientific integrity.
* Trimming is a UI affordance, not a data edit—use it judiciously and label it.

---

## 10) Glossary (quick)

* **Assembly-induced subgraph**: nodes that list the assembly key and edges among them.
* **Chosen walk / spine**: one simple, linear path selected for display.
* **Leaf spur**: short degree-1 chain attached to the trunk; often trimmed in presentation.
* **Projection**: mapping off-spine features to a span along the spine for scaled linear rendering.

---

If you want, I can add a small “provenance” object to every `getChosenWalk()` and `getSpineFeatures()` result so the UI can display the exact decisions (scores, trims, alternatives) without extra work.
