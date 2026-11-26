# Look System Architecture

**Last verified against code:** 2026-11-26.

## Overview

A **Look** is the central abstraction for controlling the visual appearance of the pan genome graph. It encapsulates materials, color schemes, emphasis states, tooltips, and per-frame animation behavior for all nodes and edges in a scene.

The system follows a **one Look per Scene** design — each Three.js Scene is paired with exactly one Look. Switching between visualization modes means switching the active scene, which activates the paired Look and deactivates all others.

---

## Looks own visual semantics; widgets are event producers

> **Rule:** stated in [`CLAUDE.md`](../../../CLAUDE.md) §Looks are the heart of the app. This section records how it plays out in practice.

The Look is the load-bearing abstraction for what the graph *looks like*. Widgets are event producers — they translate user interaction into events that drive a Look. A Look owns a coherent visual vocabulary: `NodeEmphasisLook` owns emphasized / deemphasized / absent partitioning, `HeatmapLook` owns continuous frequency coloring.

Worth spelling out, because it reliably surprises: **Look reuse across widgets is opportunistic, not symmetric.** `AssemblyWidget` and `PCLAIWidget` both happen to drive `NodeEmphasisLook` because that Look's emphasis vocabulary generalizes to both of their needs. This is empirical, not a design requirement — it's the right pattern where it works, and no obligation where it doesn't. Cross-widget symmetry of event names or state vocabularies is not a goal; the constraint that has to hold is each Look's own coherence.

When deciding to add a new Look vs. extend an existing one, see [Creating a New Look](./creating-a-new-look.md) §0.

---

## Core Components

### Look (base class)
**File**: `src/looks/look.ts`

The base class defines the full contract for a Look:

| Responsibility | Key Methods |
|----------------|-------------|
| **Mesh creation** | `createMesh()`, `createNodeMesh()`, `createEdgeMesh()` |
| **Material management** | `getNodeRibbonMaterial()`, `getNodeRibbonEmphasisMaterial()`, `getNodeRibbonDeemphasisMaterial()`, `getNodeRibbonAbsenceMaterial()`, `getNodeRibbonOffWalkMaterial()`, `getEdgeMaterial()` |
| **Emphasis** | `setNodeEmphasis()` — partitions nodes into emphasized / off-walk / absent / remainder and applies materials; `restoreNodes()` returns a set to normal |
| **Draw-order layering** | `applyEmphasisState()` sets `mesh.renderOrder` — 1 for emphasized, 0 otherwise — so emphasized nodes draw over overlapping neighbours |
| **Lifecycle** | `activate(activeScene)`, `deactivate()`, `dispose()` |
| **Event subscriptions** | `subscribe()` — typed wrapper; auto-cleanup on `deactivate()` |
| **Tooltips** | `createNodeTooltipContent()` — override for custom tooltip content |

Node emphasis states are `normal`, `emphasized`, `deemphasized`, `absent`, and `off-walk`. The remainder (nodes in none of the passed sets) becomes `deemphasized` when anything is emphasized, `normal` otherwise. `off-walk` is used in Assembly Walk mode for nodes that carry the selected assembly but lie off its monotonic walk; it is the 3D partner of the gray veil on the annotation track.

Node ribbon materials are cached in `materialCache: Map<string, ShaderMaterial>`, keyed `ribbon:<nodeName>:<state>[:<color or assembly>]`. Per-frame line-width resolution is owned by `RibbonNode` (`tickRibbonResolution()` in `src/ribbonNode.ts`), not by the Look.

Z-offset layering (`getZOffset()` / `updateGeometryPositions()`) was removed in PR #41; per-frame `updateBehavior()` was removed in PR #21.

### LookManager
**File**: `src/looks/lookManager.js`

Central registry mapping scene names to Look instances.

- `setLook(sceneName, look)` — register a Look for a scene
- `activateLook(sceneName, activeScene)` — deactivate every other look, then call `activate(activeScene)` on the one for the named scene
- `clearAllMaterialCaches()` — clear cached materials across all looks
- `dispose()` — dispose all looks

### SceneManager
**File**: `src/sceneManager.js`

Manages Three.js Scene lifecycle and delegates to LookManager for Look activation.

- `createScene(sceneName, backgroundColor)` — create and register a scene
- `setActiveScene(sceneName, renderer, camera)` — sets active scene, calls `lookManager.activateLook(sceneName, scene)`, compiles scene
- `getActiveLook()` — convenience: returns the Look for the active scene
- `clearCurrentData()` — clears all material caches and scene objects

### App
**File**: `src/app.ts`

Owns the render loop and scene switching.

- `animate()` — each frame: `tickRibbonResolution()`, update map controls, render the active scene
- `setActiveScene(sceneName, doPauseAnimation)` — pauses animation, delegates to `sceneManager.setActiveScene()`, ensures raycast visual feedback is present, resumes animation

### WidgetService
**File**: `src/widgets/widgetService.js`

The widget buttons are what switch Looks in practice. `activateLook(sceneName)` is a thin wrapper over `globals.app.setActiveScene(sceneName, true)`: the Assembly and PCLAI buttons select `nodeEmphasisScene`, the Population button selects `heatmapScene`.

---

## Concrete Looks

### NodeEmphasisLook
**File**: `src/looks/nodeEmphasisLook.ts`

Default visualization. Highlights assemblies or PCLAI coordinate keys by emphasizing matching nodes and deemphasizing others via material swaps (with `renderOrder` putting emphasized nodes on top). `assembly:emphasis` may also carry an off-walk node set; `pclaiWidget:emphasis` carries an absent node set.

**Overrides**: `activate()` (event subscriptions), `dispose()`

**Listens to**: `assembly:emphasis`, `assembly:normal`, `pclaiWidget:emphasis`, `pclaiWidget:normal`

### HeatmapLook
**File**: `src/looks/heatmapLook.ts`

Population frequency visualization. Colors every node based on how frequently a selected population or superpopulation appears in that node's assemblies.

Left-clicking a node opens a population breakdown panel for it, marked by a halo on the node.

**Overrides**: `createNodeTooltipContent()` (Node and Length, no State row), `activate()`/`deactivate()` (event subscriptions; deactivate closes the breakdown), `dispose()`

**Listens to**: `superpopulation:selected`, `superpopulation:deselected`, `population:selected`, `population:deselected`, `graph:clearing`, plus a node-click hook registered with `RaycastService` (released with the bus subscriptions on deactivate)

---

## Initialization Pattern

From `main.js`:

```
1. Create SceneManager (wrapping a new LookManager)
2. For each Look:
   a. Instantiate the Look via its factory method
   b. Create a Scene with sceneManager.createScene()
   c. Register the Look: sceneManager.lookManager.setLook(sceneName, look)
3. Create App — receives sceneManager, starts render loop
```

---

## Key Design Decisions

**One Look per Scene**: Each Look gets its own Three.js Scene. This avoids material conflicts and provides clean isolation. Switching looks means switching scenes — `App.setActiveScene()` does it, and widgets reach it only through `globals.widgetService.activateLook()`.

**Event-driven emphasis**: Looks subscribe to events in `activate()` and unsubscribe in `deactivate()`. This means only the active Look responds to widget interactions. Widgets don't need to know which Look is active.

**Material caching**: Every Look maintains its own ribbon material cache. Materials are created lazily on first request and reused thereafter, keyed by node name plus state (and color or assembly where relevant).

**Draw-order layering**: Emphasized nodes get `renderOrder = 1`, everything else 0, so emphasis wins where ribbons overlap. Geometry positions are not touched.
