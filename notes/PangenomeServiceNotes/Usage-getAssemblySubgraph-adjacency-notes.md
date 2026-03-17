Here’s the practical, “why it matters” view for your app.

# Directed vs. undirected adjacency (and when to use each)

## What they are

* **Directed adjacency** respects arrow direction on edges.

  * From the JSON, each edge is `starting_node → ending_node`.
  * We keep two maps:

    * `out[v] = { all u with v → u }`
    * `in[v]  = { all u with u → v }`
  * Degrees:

    * **out-degree(v)** = size of `out[v]`
    * **in-degree(v)**  = size of `in[v]`

* **Undirected adjacency** ignores direction; an edge connects both ways.

  * One map:

    * `adj[v] = { all u with (v → u) OR (u → v) }`
  * Degree:

    * **deg(v)** = size of `adj[v]`
  * Multiple opposite edges between the same pair are **collapsed** into a single neighbor relation.

### Tiny example

Edges in JSON:

```
A → B
B → C
C → B   (back edge)
C → D
```

Directed adjacency:

```
out:
  A: {B}
  B: {C}
  C: {B, D}
  D: {}

in:
  A: {}
  B: {A, C}
  C: {B}
  D: {C}
```

Undirected adjacency:

```
adj:
  A: {B}
  B: {A, C}
  C: {B, D}
  D: {C}
```

Notice: undirected view can’t tell you that `C → B` goes “backwards”; it only shows that B and C are connected.

---

## Why both exist in the service

Different tasks need different semantics:

### 1) Picking a start that doesn’t go “upstream”

* We look at the **directed** subgraph for your chosen assembly and prefer **sources**:

  * nodes with `in-degree = 0` and `out-degree > 0`.
* Among sources, we choose the one with the largest **downstream bp-reach**.
* That’s how `startPolicy: "preferArrowEndpoint"` works.
* This prevents starting in the middle of a cycle or walking against arrows.

### 2) Building a long, simple linear path (the walk itself)

* Once we have a component (induced by the assembly), we compute a **simple path** inside it.
* A simple path cares about **connectivity**, not direction; otherwise a single back edge would break reachability.
* So pathfinding uses the **undirected `adj`** map (BFS sweep / double-sweep).
* After we have the node list, we may **orient** it to agree with arrow flow (`directionPolicy: "edgeFlow"`), but we don’t *constrain* the walk to obey direction while searching.

### 3) Event discovery (pills, bubbles, braids)

* We explore “side” regions between consecutive spine anchors `(L, R)`.
* For completeness, we use **undirected adjacency**, so we don’t miss an alt route just because it has a back edge somewhere.
* Classification then uses **spine projection** and simple checks (e.g., does the region contain `R` → bubble; if not, and allowed → dangling; if it touches mid-spine nodes → braid).
* Direction is still respected when we compute **edgeFlow** scores or when you want arrow-consistent starts, but the *region* is best seen undirected.

---

## When to ask for which in your API

* `getAssemblySubgraph(key, { includeDirectedAdj: true })`
  Use this when you need:

  * arrow-consistent endpoints,
  * in/out degree diagnostics,
  * to visualize or debug flow (what edges really point forward).

* `getAssemblySubgraph(key, { includeAdj: true })`
  Use this when you need:

  * connectivity for traversal,
  * component overlays,
  * corridor detection or “is this a linear stretch?” checks.

You can, of course, request **both** if you want a full picture.

---

## Practical consequences to keep in mind

* **Connected vs. strongly-connected**:

  * Undirected `adj` partitions into **connected components**.
  * Directed `out/in` partitions into **SCCs** and DAGs between them. A node can be “reachable” undirected but not reachable **forward**.

* **Start choice matters**:

  * If you start from a directed source, you’ll intuitively “enter the window and go downstream.”
  * If no sources exist (cycle), we fall back to a **diameter-like** simple path (still linear, deterministic).

* **Degrees differ**:

  * A node might have `deg(adj)=2` but `in=2, out=0`, which is a terminal from a flow perspective.
  * Pills often add neighbors without increasing directed forward options; undirected exploration still finds them.

* **Parallel/Reverse edges**:

  * If both `u→v` and `v→u` exist, undirected collapses to `{u↔v}`; directed views show two distinct flows.

---

## Quick code peeks (with your service)

```js
// Undirected connectivity (component-friendly)
const subU = svc.getAssemblySubgraph("GRCh38#0#chr1", { includeAdj: true });
console.log(subU.adj["2912+"]);

// Directed flow (arrow-aware)
const subD = svc.getAssemblySubgraph("GRCh38#0#chr1", { includeDirectedAdj: true });
console.log(subD.in["2913+"], subD.out["2912+"]);
```

---

## Rules of thumb

* **Choose starts with directed info;**
* **Traverse with undirected info;**
* **Orient/score with directed info.**

That split is exactly what your current `PangenomeService` does internally, and it’s why walks are linear and long, starts make biological sense, and events don’t disappear just because a detour has a backward edge somewhere.
