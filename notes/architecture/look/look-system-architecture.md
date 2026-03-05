# Look System Architecture

## Overview

A **Look** is the central abstraction for controlling the visual appearance of the pan genome graph. It encapsulates materials, color schemes, emphasis states, tooltips, and per-frame animation behavior for all nodes and edges in a scene.

The system follows a **one Look per Scene** design — each Three.js Scene is paired with exactly one Look. Switching between visualization modes means switching the active scene, which activates the paired Look and deactivates all others.

---

## Core Components

### Look (base class)
**File**: `src/looks/look.js`

The base class defines the full contract for a Look:

| Responsibility | Key Methods |
|----------------|-------------|
| **Mesh creation** | `createMesh()`, `createNodeMesh()`, `createEdgeMesh()` |
| **Material management** | `getNodeMaterial()`, `getNodeEmphasisMaterial()`, `getEdgeMaterial()` |
| **Color hooks** | `getNodeColor()`, `getEdgeColors()` — override in subclasses |
| **Emphasis** | `setNodeAndEdgeEmphasis()`, `restoreLinesandEdgesViaZOffset()` |
| **Z-offset layering** | `getZOffset()`, `updateGeometryPositions()` |
| **Lifecycle** | `activate()`, `deactivate()`, `dispose()` |
| **Animation** | `updateBehavior(deltaTime, scene)` — called every frame |
| **Tooltips** | `createNodeTooltipContent()` — override for custom tooltip content |

Materials are cached in `materialCache: Map<cacheKey, Material>` and registered with `lineMaterialResolutionService` for resolution-aware rendering.

### LookManager
**File**: `src/looks/lookManager.js`

Central registry mapping scene names to Look instances.

- `setLook(sceneName, look)` — register a Look for a scene
- `activateLook(sceneName)` — deactivate all looks, then activate the one for the named scene
- `clearAllMaterialCaches()` — clear cached materials across all looks
- `dispose()` — dispose all looks

### SceneManager
**File**: `src/sceneManager.js`

Manages Three.js Scene lifecycle and delegates to LookManager for Look activation.

- `createScene(sceneName, backgroundColor)` — create and register a scene
- `setActiveScene(sceneName, renderer, camera)` — sets active scene, calls `lookManager.activateLook()`, compiles scene
- `getActiveLook()` — convenience: returns the Look for the active scene
- `clearCurrentData()` — clears all material caches and scene objects

### App
**File**: `src/app.js`

Owns the render loop and scene switching.

- `animate()` — each frame: update line material resolution, update map controls, call `look.updateBehavior()`, render
- `setActiveScene(sceneName, doPauseAnimation)` — pauses animation, delegates to `sceneManager.setActiveScene()`, ensures raycast visual feedback is present, resumes animation

---

## Concrete Looks

### NodeEmphasisLook
**File**: `src/looks/nodeEmphasisLook.js`

Default visualization. Highlights assemblies or PCA coordinate keys by emphasizing matching nodes/edges and deemphasizing others via material swaps and Z-offset layering.

**Overrides**: `getZOffset()` (state-based Z), `updateBehavior()` (edge arrow animation — currently disabled), `activate()`/`deactivate()` (event subscriptions)

**Listens to**: `assembly:emphasis`, `assembly:normal`, `pcaWidget:emphasis`, `pcaWidget:normal`

### HeatmapLook
**File**: `src/looks/heatmapLook.js`

Population frequency visualization. Colors every node based on how frequently a selected population or superpopulation appears in that node's assemblies.

**Overrides**: `createNodeTooltipContent()` (population frequency tooltip), `activate()`/`deactivate()` (event subscriptions)

**Listens to**: `superpopulation:selected`, `superpopulation:deselected`, `population:selected`, `population:deselected`

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

**One Look per Scene**: Each Look gets its own Three.js Scene. This avoids material conflicts and provides clean isolation. Switching looks means switching scenes via `app.setActiveScene()`.

**Event-driven emphasis**: Looks subscribe to events in `activate()` and unsubscribe in `deactivate()`. This means only the active Look responds to widget interactions. Widgets don't need to know which Look is active.

**Material caching**: Every Look maintains its own material cache. Materials are created lazily on first mesh creation and reused thereafter. Cache keys use `Look.getCacheKey(nodeName)`.

**Z-offset layering**: Emphasized elements are brought forward, deemphasized elements are pushed back. `NodeEmphasisLook` overrides `getZOffset()` to implement state-dependent layering.
