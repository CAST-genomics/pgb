# Distinguishing Off-Spine **Keyed** vs **Non-Keyed** Nodes

When a user selects an assembly (e.g., `CHM13#0#chr1`) as the **spine**, every node in the graph falls into one of three buckets:

1. **On-spine (keyed)**
   Nodes that both (a) contain the selected assembly key in their `assemblies[]`, and (b) lie on the single simple path we extracted for that key. These define the x-axis in the linear view and are drawn with full emphasis.

2. **Off-spine (keyed)**
   Nodes that contain the key but are **not** on the chosen simple path. Reasons include:

   * They sit on the *other leg* of a parallel segment (diamond/pill) inside the same keyed component.
   * They belong to a *different keyed component* (still the same key, but disconnected in the current window).
   * They lie outside the current window.

   Off-spine keyed nodes are biologically relevant to the selected assembly. In the linear view, they appear:

   * **as events** (pill/bubble/braid) if they connect back to the spine within the window, or
   * under `offSpine[]` (context only) if they never touch the spine in the window.

3. **Off-spine (non-keyed)**
   Nodes that do **not** list the selected key in `assemblies[]`. They belong to other assemblies and are useful background context but are not part of the currently selected assembly.

## Why this distinction matters

* **Interpretation:** Off-spine keyed nodes indicate **alternative routes** or **other segments** of the same assembly; non-keyed nodes don’t.
* **Navigation:** Clicking an off-spine keyed node can offer actions like *“show all keyed components,” “jump to keyed segment,” “cover-all mode.”*
* **Rendering:** Use different visual emphasis. A simple policy:

  * **On-spine (keyed):** strong highlight.
  * **Off-spine (keyed):** same hue, lower opacity or colored outline; interactive.
  * **Off-spine (non-keyed):** faint gray; minimal interactivity.

## Linearized view implications

* The **spine** uses true bp positions on the selected assembly.
* **Off-spine keyed** nodes that tie into the spine form **events** with anchors on the spine:

  * Adjacent anchors ⇒ **pill** (insertion at a single bp).
  * Non-adjacent anchors ⇒ **bubble / parallel bundle** (arc from `spanStart` to `spanEnd`).
  * Overlapping/nesting events ⇒ **braid**.
* **Off-spine non-keyed** nodes only appear as faint context (e.g., when focusing an event’s region).

---

# Code Additions

Below are drop-in, plain-JS utilities that sit alongside your `PangenomeService` and help you classify, style, and optionally surface “cover-all” information.

> Assumptions:
>
> * You already have `svc` as an instance of `PangenomeService` with `.graph`, `.createAssemblyWalk(...)`, and `.assessGraphFeatures(...)`.
> * Node ids include orientation (`+`/`-`).
> * Your features object is the result of `assessGraphFeatures(spineWalk, opts)` for the **current** spine.

## 1) Basic helpers (key membership & keyed subgraph)

```js
// Is this node tagged with the selected assembly key?
export function isKeyedNode(svc, nodeId, key) {
  const n = svc.graph?.nodes.get(nodeId);
  return !!(n && Array.isArray(n.assemblies) && n.assemblies.includes(key));
}

// Build the keyed induced subgraph (for highlighting "everything keyed")
export function getKeyedSubgraph(svc, key) {
  const nodesSet = svc.graph?.index?.byAssembly?.get(key) || new Set();
  const nodes = [...nodesSet];
  const edges = [];

  for (const a of nodes) {
    const nbrs = svc.graph.adj.get(a) || [];
    for (const b of nbrs) {
      if (!nodesSet.has(b)) continue;
      const ekF = `edge:${a}:${b}`;
      const ekR = `edge:${b}:${a}`;
      if (svc.graph.edges.has(ekF) || svc.graph.edges.has(ekR)) {
        // avoid duplicates with string order
        if (a < b) edges.push(`edge:${a}:${b}`);
      }
    }
  }
  return { nodes, edges };
}
```

## 2) Classify any node for the current spine/key

```js
// Returns { keyed, onSpine, reason, componentIndex }
export function classifyNodeForKey(svc, nodeId, key, features) {
  const keyed = isKeyedNode(svc, nodeId, key);
  if (!keyed) return { keyed: false, onSpine: false, reason: "not_keyed" };

  const onSpine = !!(features?.spine?.nodes?.some(sn => sn.id === nodeId));
  if (onSpine) return { keyed, onSpine, reason: "on_spine" };

  // See whether it's in the same keyed component as one of the walk paths
  const walk = svc.createAssemblyWalk(key, { mode: "auto" });
  for (let i = 0; i < walk.paths.length; i++) {
    if (walk.paths[i].nodes.includes(nodeId)) {
      return { keyed, onSpine, reason: "parallel_or_cycle_in_component", componentIndex: i };
    }
  }
  return { keyed, onSpine, reason: "other_keyed_component" };
}
```

## 3) Style decision (graph view)

Use this mapping to pick color/opacity/line style for nodes and edges in your original graph view.

```js
// Decide visual style based on classification
export function styleForNode(svc, nodeId, key, features, palette) {
  // palette: { hue, onSpine: {opacity}, keyedOff: {opacity}, nonKeyed: {opacity} }
  const cls = classifyNodeForKey(svc, nodeId, key, features);

  if (!cls.keyed) {
    return { color: palette.gray || "#D9D9D9", opacity: (palette.nonKeyed?.opacity ?? 0.18), interactive: false };
  }
  if (cls.onSpine) {
    return { color: palette.hue, opacity: (palette.onSpine?.opacity ?? 1.0), interactive: true };
  }
  // keyed but not on spine
  return { color: palette.hue, opacity: (palette.keyedOff?.opacity ?? 0.4), outline: true, interactive: true };
}
```

## 4) Style decision (linearized view, when focusing an event)

When hovering/expanding an event you can emphasize the exact region:

```js
// Highlight event region: anchors, interior nodes, and anchor edges
export function styleForEventNodes(nodeId, event, baseStyle) {
  const anchors = new Set([event.anchors.leftId, event.anchors.rightId].filter(Boolean));
  if (anchors.has(nodeId)) return { ...baseStyle, weight: "bold" };

  for (const p of event.paths) {
    if (!Array.isArray(p.nodesDetailed)) continue;
    if (p.nodesDetailed.some(d => d.id === nodeId)) {
      return { ...baseStyle, opacity: 0.9 };
    }
  }
  return { ...baseStyle, opacity: 0.15 };
}
```

## 5) (Optional) “Cover-all” simple paths for a keyed component

If you want a toggle that covers **all keyed edges** (not just one simple path), you can greedily peel edge-disjoint simple paths from the keyed component. This is a heuristic but works well for UI highlighting.

```js
// Greedy edge-disjoint path cover over the keyed induced subgraph.
export function coverAllSimplePaths(svc, key, maxChains = 10) {
  const { nodes, edges } = getKeyedSubgraph(svc, key);
  if (!nodes.length) return [];

  // Build undirected adjacency with edge availability flags
  const adj = new Map(nodes.map(id => [id, new Set()]));
  edges.forEach(ek => {
    const [, a, b] = ek.split(":");
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  });

  const chains = [];
  let used = new Set(); // used edges "a|b" with a<b

  function keyEdge(a, b) { return (a < b) ? `${a}|${b}` : `${b}|${a}`; }
  function neighborsFree(u) {
    return [...(adj.get(u) || [])].filter(v => !used.has(keyEdge(u, v)));
  }

  function findEndpoint(start) {
    // walk to a pseudo-endpoint (degree 1 in free-edge view, else farthest)
    let u = start, prev = null;
    while (true) {
      const nbrs = neighborsFree(u).filter(v => v !== prev);
      if (nbrs.length <= 1) return u;
      prev = u;
      u = nbrs[0];
    }
  }

  function bfsPath(s, t) {
    const Q = [s], prev = new Map([[s, null]]);
    while (Q.length) {
      const u = Q.shift();
      if (u === t) break;
      for (const v of neighborsFree(u)) {
        if (!prev.has(v)) { prev.set(v, u); Q.push(v); }
      }
    }
    if (!prev.has(t)) return null;
    const path = [];
    for (let x = t; x != null; x = prev.get(x)) path.push(x);
    path.reverse();
    return path;
  }

  let rounds = 0;
  while (rounds < maxChains) {
    // pick a start in remaining edges
    let start = null;
    outer:
    for (const a of nodes) {
      for (const b of neighborsFree(a)) { start = a; break outer; }
    }
    if (!start) break;

    const s = findEndpoint(start);
    // pick a different endpoint
    let t = s;
    for (const v of neighborsFree(s)) { t = findEndpoint(v); break; }
    const path = bfsPath(s, t) || [s]; // at least a singleton

    // mark edges in path as used
    for (let i = 0; i < path.length - 1; i++) {
      used.add(keyEdge(path[i], path[i + 1]));
    }
    chains.push({ nodes: path.slice(), edges: path.slice(1).map((b, i) => `edge:${path[i]}:${b}`) });
    rounds++;
  }
  return chains;
}
```

**Usage (UI):**

* Default: show the **primary** spine path (`createAssemblyWalk(...).paths[0]` or *longest*).
* “Show everything for this assembly”: call `coverAllSimplePaths(svc, key)` and draw all chains at low opacity, highlighting the spine chain.

## 6) Tooltip resolver

One call that prefers **spine coords**, falls back to **projected** event coords, then **node-local**:

```js
export function resolveTooltipCoords(svc, nodeId, features, { event = null } = {}) {
  // spine coords (true on current axis)
  const onSpine = svc.getBpExtent?.(nodeId);
  if (onSpine) return { ...onSpine, system: "spine" };

  // projected within a focused event
  if (event) {
    const proj = svc.getProjectedBpInEvent?.(nodeId, event);
    if (proj) return { ...proj, system: proj.projected ? "projected" : "spine" };
  }

  // node-local
  const n = svc.graph?.nodes.get(nodeId);
  if (n) return { bpStart: 0, bpEnd: (n.lengthBp || 0), system: "node-local" };
  return null;
}
```

---

## How to wire it in your app

```js
// After you compute features for the chosen spine:
svc.setActiveSpine(features.spine);

const key = currentAssemblyKey;

// Graph view styling
for (const nodeId of allNodeIds) {
  const style = styleForNode(svc, nodeId, key, features, {
    hue: "#2F80ED",
    onSpine: { opacity: 1.0 },
    keyedOff: { opacity: 0.45 },
    nonKeyed: { opacity: 0.18 },
    gray: "#D9D9D9"
  });
  drawNode(nodeId, style);
}

// Optional: show everything keyed (dim)
const keyedSub = getKeyedSubgraph(svc, key);
// draw keyedSub.nodes / keyedSub.edges at low opacity behind the walk

// Tooltip
canvas.on("hoverNode", nodeId => {
  const coords = resolveTooltipCoords(svc, nodeId, features);
  const cls = classifyNodeForKey(svc, nodeId, key, features);
  showTooltip({
    node: nodeId,
    coords,
    status: cls.reason // "on_spine" | "parallel_or_cycle_in_component" | "other_keyed_component" | "not_keyed"
  });
});
```

---

**Bottom line:** keep **off-spine keyed** visible and interactive (they’re part of the selected assembly’s story), keep **off-spine non-keyed** light as context, and use the helpers above to drive both styling and tooltips consistently.
