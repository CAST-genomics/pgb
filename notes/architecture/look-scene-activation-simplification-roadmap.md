# Roadmap: Simplify Look + Scene activation lifecycle

**Status:** Draft for review. Supersedes the hexagonal-core direction in GitHub issue #40.

## Guiding principle

**Look = material + the user interactions that manipulate it.** `LookManager` registers Looks; `SceneManager` swaps scenes when materials change (because that's how Three.js wants it). No new abstractions, no reducer/controller/diff pipeline. Every change below either removes code or collapses redundancy inside `Look` and its subclasses.

## Look semantics are the same across subclasses

`NodeEmphasisLook` and `HeatmapLook` are semantically equivalent:

| Concern | NodeEmphasisLook | HeatmapLook |
|---|---|---|
| Subscribes to events | assembly + PCLAI widget events | population / superpopulation events |
| Produces a tooltip | node name, length, emphasis state | population tooltip |
| Changes node appearance | swaps material per phase | mutates `diffuse` uniform per frequency |
| Owns the active scene | yes (today: via `sceneManager`) | yes (today: via `sceneManager`) |

The only asymmetry is the **absent** state — `NodeEmphasisLook` distinguishes "data says this isn't emphasized" from "the dataset has no information to decide." `HeatmapLook` has no analogous case. That asymmetry stays local to `NodeEmphasisLook`.

Because the base semantics are shared, every change below should apply symmetrically to both Looks — the refactor is not a `NodeEmphasisLook` specialty.

## Testing philosophy (important — this shapes the plan)

PGB is a data-visualization app. Look behavior is verified by **looking at it**. Wrong materials, wrong layering, wrong colors are immediately obvious on screen and take seconds to catch. Writing vitest cases that assert which fake material got assigned to which fake mesh adds maintenance cost without catching anything the eye wouldn't already catch in the dev server.

**Consequence for this roadmap:** no new unit tests covering Look / Heatmap / NodeEmphasis behavior. The only tests worth writing here would be for plumbing that isn't visual (event-subscription accounting, scene-reference invalidation on deactivate) — and even those are cheap enough to verify by hand. Visual verification in the browser **is** the test plan. Every commit below ends with a visual check.

## What's wrong today

1. **`Look` holds `sceneManager`** only so it (and `HeatmapLook`) can call `getActiveScene().getObjectByName('NodeMeshGroup')`. That creates the `Look → SceneManager → LookManager → Look` cycle and leaves stale scene references alive across dataset swaps (plausible contributor to the second-dataset-load crash).
2. **Five event handlers for three transitions in `NodeEmphasisLook`.** The three transitions are *emphasize a set*, *mark a set absent*, *restore a set*. The five handlers exist because each publisher shapes its payload slightly differently — payload normalization is happening too late.
3. **State-aware Z-offset machinery** (`NODE_LINE_DEEMPHASIS_Z_OFFSET`, `Look.getZOffset()` override, `Look.updateGeometryPositions()`) — more complexity than the visual payoff justifies. Ribbon materials already `depthWrite: true`.
4. **Subscription boilerplate repeated in both subclasses.** `NodeEmphasisLook` tracks five unsubs, `HeatmapLook` tracks four, each with its own cleanup pattern. The boilerplate should live once, on `Look`.

## The plan

### Commit 1 — Break the `Look ↔ sceneManager` hold (applies to both subclasses)

Remove `sceneManager` as a field on `Look`. `LookManager.activate(name)` already knows which scene is about to become active — pass it in:

```ts
// LookManager
activate(name: string, activeScene: THREE.Scene) {
    this.currentLook?.deactivate();
    this.currentLook = this.looks.get(name);
    this.currentLook?.activate(activeScene);
}
```

`Look.activate(scene)` stores `this.activeScene = scene`. `Look.deactivate()` clears it (`this.activeScene = null`). Both `NodeEmphasisLook.updateNodeEmphasis` / `updateGeometryPositions` and `HeatmapLook.handleSelectionEvent` read the `NodeMeshGroup` from `this.activeScene` instead of `this.sceneManager.getActiveScene()`.

**Net effect on the cycle:** `SceneManager` still holds `LookManager`, `LookManager` still holds `Look`, but `Look` no longer holds `SceneManager`. The cycle is broken.

**Net effect on the second-dataset-load crash:** stale scene references are guaranteed to be cleared on `deactivate()`, which happens before any dataset swap.

One call site in `SceneManager` (wherever it currently calls `lookManager.activate(name)`) picks up the new signature.

**Visual check:** swap Looks back and forth, load a second dataset.

### Commit 2 — Lift subscription boilerplate into `Look`

Both subclasses carry a list of unsub functions and repetitive null-check cleanup. Add two protected helpers to `Look`:

```ts
protected subscribe<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void {
    this.unsubs.push(eventBus.subscribe(event, handler));
}

deactivate(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.activeScene = null;
    this.isActive = false;
}
```

`NodeEmphasisLook.activate` becomes `this.subscribe('assembly:emphasis', …)` × 5, no field declarations, no cleanup code. Same for `HeatmapLook`.

No behavior change, ~40 lines deleted, the two subclasses look nearly structurally identical.

**Visual check:** exercise every event path in both Looks.

### Commit 3 — Collapse the 5 emphasis handlers into 2 paths on `NodeEmphasisLook`

Normalize the payload at the subscription boundary. After this commit, the five `subscribe` calls remain (they must — different event names), but they all funnel into a single `applyPartition(...)` method plus a `restoreNodes(...)` method. `Look.setNodeEmphasis`, `Look.setNodeAbsence`, and `Look.restoreNodes` collapse into one `applyPartition(assembly, emphasizedSet, color, absentSet, deemphasisColor)` — `pclaiWidget:absence` calls it with `emphasizedSet = ∅`.

This is `NodeEmphasisLook`-specific. `HeatmapLook` is untouched.

**Visual check:** emphasis from the assembly widget and from the PCLAI widget, absence mode (PCLAI open, no dot selected), restore.

### Commit 4 — Delete state-aware Z-offset

Remove:
- `GeometryFactory.NODE_LINE_DEEMPHASIS_Z_OFFSET`
- `Look.getZOffset()`'s state branch (if any remains after commit 3)
- `NodeEmphasisLook.getZOffset()` override (the whole method)
- `Look.updateGeometryPositions()` and every call site in `applyPartition` / `restoreNodes`

Baseline `NODE_LINE_Z_OFFSET` / `EDGE_LINE_Z_OFFSET` baked into geometry at creation stay untouched — nodes still sit in front of edges.

**Visual check:** this is the commit most likely to surface a regression. Run assembly emphasis, PCLAI emphasis, absence. If sort-order glitches appear, fall back to `mesh.renderOrder` inside `applyEmphasisState`. Most likely not needed.

## What stays unchanged

- `Look` / `LookManager` / `SceneManager` triad. Still three objects.
- `NodeEmphasisLook extends Look`, `HeatmapLook extends Look`. All material + interaction logic lives on these classes.
- No new files, no new directories, no new abstractions.
- Tooltips, animation, PCLAI chart, widgets, material factories. Untouched.

## Out of scope (explicitly rejected)

- Pure reducer + commands + diffs (the RFC's hexagonal core). Solves a testability problem we don't have; PGB is verified visually.
- `MaterialResolver`, `DiffRenderer`, `EmphasisController` ports. Each takes ownership away from the Look.
- New `src/core/emphasis/` or `src/looks/emphasis/` directories.
- Unit tests of Look visual behavior.

## Risk / effort

~4 small commits, ~150 lines removed, ~30 added. Only callers of `LookManager.activate(name)` change signature — one site. Every commit ends in a visual check in the dev server. Worst-case regression is a Z-ordering glitch that `mesh.renderOrder` fixes in one line.

## Open questions for review

1. Does this match the mental model you intended when you built the Look / LookManager / SceneManager triad?
2. File as a new GitHub issue, or keep as an inline plan we execute from here?
3. Close existing issue #40 as superseded?
