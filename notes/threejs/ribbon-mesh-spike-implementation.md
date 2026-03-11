# Ribbon Mesh Spike — Implementation Guide

**Status:** Implemented (Phase 1 — solid color rendering), Line2 code fully removed
**Branch:** `ribbon-mesh`
**Date:** 2026-03-10
**Companion document:** [ribbon-mesh-spike-plan.md](./ribbon-mesh-spike-plan.md)

## Overview

This document describes the implementation of the ribbon mesh spike — a custom triangle-strip mesh and shader pair that replaces Three.js Line2/LineMaterial for node rendering. The plan document covers the *why* and *what*; this document covers the *how* — the actual code, the decisions made during implementation, and how the pieces fit together.

All Line2/LineMaterial code has been removed. The ribbon path is the only rendering path.

## New Files

### `shaders/ribbon.vert.glsl`

The vertex shader is 12 lines. It does one thing: offset each vertex from the spline centerline along the precomputed perpendicular direction by `halfWidth * side`.

```
centerline position + normal2d × side × halfWidth → final position
```

The `halfWidth` uniform is in world units, updated every frame by the resolution service. Since the camera is orthographic, this produces a constant screen-pixel width regardless of zoom.

UV output: `vUv = vec2(uParam, side * 0.5 + 0.5)` maps `u ∈ [0,1]` along the node and `v ∈ [0,1]` across the width.

### `shaders/ribbon.frag.glsl`

The fragment shader outputs `diffuse` color at `opacity`, optionally multiplied by an alpha matte texture. The `useAlphaMap` uniform toggles texture sampling (0.0 = off, 1.0 = on). Fragments with alpha below 0.01 are discarded. Ends with `#include <colorspace_fragment>` to apply Three.js sRGB output encoding (required for `ShaderMaterial` when `renderer.outputColorSpace = SRGBColorSpace`).

No distance computation, no endcap logic, no dash calculation.

### `src/ribbonLine.js`

`RibbonLine` extends `THREE.Mesh` and provides the parametric interface needed by the rest of the app:

- **`getPoint(t, space)`** — delegates to the spline stored in `userData.spline`. Clamps t to [0,1], sets z from `userData.zOffset`, optionally transforms to world space.

- **`static getParameter(intersection)`** — recovers the t-parameter from a raycast hit. The UV-based approach reads `intersection.uv.x` directly — no arc-length table, no binary search.

- **Custom `raycast()` override** — the CPU-side geometry is centerline-only (the vertex shader expands by `halfWidth`), so Three.js default mesh raycasting would never hit. The custom implementation does coarse-to-fine spline proximity testing:
  1. Coarse search: 32 evenly-spaced samples along the spline
  2. Fine search: 16 samples in the interval nearest the pointer
  3. Hit if distance ≤ `halfWidth`
  4. Returns intersection with `uv = new THREE.Vector2(bestT, 0.5)`

### `src/ribbonMaterialFactory.js`

Static factory for ribbon `ShaderMaterial` instances:

- **`createMaterial(color, options)`** — creates a `THREE.ShaderMaterial` with uniforms for `diffuse`, `opacity`, `halfWidth`, `alphaMap`, and `useAlphaMap`. **Clones** the input `THREE.Color` to prevent aliasing when materials share a source color. Material is transparent, double-sided, depth-writing.

- **`computeHalfWidth(camera, pixelWidth, container)`** — the orthographic constant-width formula:
  ```
  worldPerPixel = (camera.top - camera.bottom) / (camera.zoom × container.clientHeight)
  halfWidth = pixelWidth × worldPerPixel / 2
  ```
  Note: `camera.zoom` must be included because MapControls changes zoom, not the frustum bounds.

## Modified Files

### `src/lineFactory.js` — Adaptive Tessellation

Contains `static createNodeRibbonGeometry(spline, zOffset)` and `static createEdgeRectGeometry(xyzStart, xyzEnd)`. All Line2-related code (`createNodeLineGeometry`, `buildArcLengthTable`, `fixedSplineDivisions`, `adaptiveSplineDivisions`) has been removed.

**Adaptive sampling** uses recursive midpoint subdivision with three static parameters:

| Parameter | Value | Effect |
|-----------|-------|--------|
| `FLATNESS_TOLERANCE` | 0.5 world units | Max deviation before subdividing |
| `MIN_DEPTH` | 3 | At least 8 segments per node (floor) |
| `MAX_DEPTH` | 8 | At most 256 segments per node (cap) |

The algorithm (`#adaptiveSample` → `#subdivide`):
1. Start with endpoints t=0 and t=1
2. For each interval, evaluate the midpoint on the spline
3. Measure perpendicular distance from midpoint to the straight line between endpoints (`#pointToLineDistance`)
4. If deviation > tolerance OR depth < minimum → subdivide both halves
5. If depth >= maximum → stop regardless
6. Sort all samples by t

**Geometry construction** from the sorted samples:
- For each sample point: compute tangent (central difference), rotate 90° for the 2D normal
- Create two vertices per sample: top (side=+1) and bottom (side=-1)
- Both share the same position (centerline), normal2d, and uParam — they differ only in `side` and `uv.y`
- Index buffer: N-1 quads, 2 triangles each, standard strip winding

Stored in `geometry.userData`: `totalArcLength` (for future texture aspect ratio) and `sampleCount` (for diagnostics).

### `src/geometryFactory.js` — Geometry Creation

Always creates ribbon geometry via `LineFactory.createNodeRibbonGeometry()`. The `useRibbon` toggle and `createNodeLineGeometry` dispatch have been removed.

`getTotalLine2Points` reads `geometry.userData.sampleCount` for ribbon geometries.

### `src/geometryManager.js` — Scene Mesh Creation

Creates `GeometryFactory` with no special options. The `buildArcLengthTable` import and conditional have been removed — ribbon meshes encode the t-parameter in UV coordinates.

Passes `spline: data.spline` in the context object so `Look.createMesh` can store it in `userData`.

### `src/lineMaterialResolutionService.js` — Ribbon Material Management

Manages a single `Set` of ribbon `ShaderMaterial` instances. All Line2 material management (`materials` Set, `registerMaterial`, `updateMaterialResolution`, `updateAllMaterials`, `getCurrentSize`, `initialize`, `handleResize`, `handlePixelRatioChange`) has been removed.

**`registerRibbonMaterial(material)`** — guards on `material.uniforms?.halfWidth !== undefined`.

**`update(camera, container)`** — computes `halfWidth` once via `RibbonMaterialFactory.computeHalfWidth`, applies to all registered materials.

### `src/looks/look.js` — Mesh Creation and Emphasis

Ribbon is the only rendering path. Key methods:

**`createMesh(geometry, context)`** — dispatches to `createNodeMesh` or `createEdgeMesh` based on `context.type`.

**`createNodeMesh(geometry, context)`** — creates a `RibbonLine`, sets `userData` with `nodeName`, `geometryKey`, `type`, `spline`, and `zOffset`.

**Three ribbon material methods:**

| Method | Cache key pattern | Purpose |
|--------|------------------|---------|
| `getNodeRibbonMaterial(nodeName)` | `ribbon:<name>:normal` | Default tin color |
| `getNodeRibbonEmphasisMaterial(assemblyName, nodeName, nodeColor)` | `ribbon:<name>:assembly:<assembly>` | Emphasis color (single or per-node Map) |
| `getNodeRibbonDeemphasisMaterial(nodeName)` | `ribbon:<name>:deemphasis` | Mercury (faded) color |

All three register with `lineMaterialResolutionService.registerRibbonMaterial()`.

**`applyEmphasisState`** — always uses ribbon material methods for each state (normal, emphasized, deemphasized).

**`updateGeometryPositions`** — uses `mesh.position.z` offset for z-layering.

### `src/looks/heatmapLook.js` — Population Frequency Colors

`handleSelectionEvent` walks `nodeMeshGroup.children` directly (no material cache). Sets color via:
```javascript
mesh.material.uniforms.diffuse.value.copy(color)
```
This avoids caching complexity for heatmap colors which vary per population selection.

### `src/raycastService.js` — Intersection Processing

`#processIntersection` always uses `RibbonLine.getParameter(intersection)` for node hits. All Line2/ParametricLine intersection code has been removed (no arc-length tables, no `findClosestT`, no threshold configuration).

The constructor takes only `(container)` — no threshold parameter.

### `src/materialService.js` — Simplified

`getNodeDeemphasisMaterial` and its `LineMaterial`/`lineMaterialResolutionService` imports removed. The `lineMaterialCache` removed. `clear()` and `dispose()` are now no-ops (retained for call-site compatibility).

### `src/app.js` — Initialization Cleanup

Removed `lineMaterialResolutionService.initialize(renderer)` and `lineMaterialResolutionService.handleResize()` calls — ribbon materials don't need the renderer reference (halfWidth is computed from camera/container).

## Data Flow

```
JSON ogdf_coordinates
    ↓
GeometryFactory.#createSplines()          CatmullRomCurve3 per node
    ↓
GeometryFactory.#createNodeGeometries()   ribbon geometry
    ↓
LineFactory.createNodeRibbonGeometry()    adaptive sample → triangle strip BufferGeometry
    ↓
GeometryManager.createAllSceneNodeMeshes()
    ↓
Look.createNodeMesh()
    ↓
RibbonMaterialFactory.createMaterial()    ShaderMaterial with halfWidth uniform
    ↓
new RibbonLine(geometry, material)        THREE.Mesh subclass
    ↓
scene.NodeMeshGroup.add(mesh)

Per frame:
    lineMaterialResolutionService.update()
        → RibbonMaterialFactory.computeHalfWidth()
        → material.uniforms.halfWidth.value = halfWidth

On raycast hit:
    RibbonLine custom raycast()           coarse-to-fine spline proximity test
        → uv.x = t parameter             (free from spline proximity)
    RibbonLine.getParameter(intersection)
        → t = intersection.uv.x
```

## Bugs Fixed During Implementation

1. **`getTotalLine2Points` crash** — Ribbon geometry doesn't have `instanceStart`. Fixed by checking for `userData.sampleCount`.

2. **Node width not constant on zoom** — `computeHalfWidth` formula missed `camera.zoom`. MapControls changes zoom, not frustum bounds. Fixed by dividing by `camera.zoom`.

3. **Raycasting not working** — GPU geometry is expanded by halfWidth in vertex shader, but CPU geometry is centerline-only. Fixed by implementing custom `raycast()` override on RibbonLine with coarse-to-fine spline proximity test.

4. **HeatmapLook `getActiveScene` undefined** — `sceneManager` wasn't passed in HeatmapLook config in `main.js`. Fixed.

5. **HeatmapLook all nodes same color** — `RibbonMaterialFactory.createMaterial` didn't clone the input `THREE.Color`, so all materials shared the same `uniforms.diffuse.value` reference. Fixed by cloning in `createMaterial`. Also rewrote `handleSelectionEvent` to walk scene meshes directly instead of using material cache.

6. **Node colors too dark** — `ShaderMaterial` bypasses Three.js color management. With `renderer.outputColorSpace = SRGBColorSpace`, built-in materials automatically apply linear-to-sRGB conversion, but custom shaders do not. Fixed by adding `#include <colorspace_fragment>` at the end of `ribbon.frag.glsl`.

## What's Not Implemented Yet (Phase 2)

- **Canvas texture integration** — the `alphaMap` uniform and `useAlphaMap` toggle are wired in the shader and material factory but no textures are assigned. `lineCanvasTextureFactory.js` is ready to use.
- **Per-node texture aspect ratio** — `geometry.userData.totalArcLength` is stored for this purpose.

## Architecture Decisions

### Why `mesh.position.z` instead of modifying geometry buffer attributes

Line2's `instanceStart/instanceEnd` interleaved format required per-vertex z updates when changing emphasis depth. Ribbon geometry uses standard `BufferAttribute`, which could be modified the same way — but `mesh.position.z` is simpler (one property vs iterating the position array) and matches how edge meshes already handle z-offsets.

### Why the UV-based t-parameter works

Three.js `Mesh.raycast` computes barycentric coordinates at the intersection point and interpolates the `uv` attribute. Since we set `uv.x = uParam` at every vertex (the arc-length parameter), the interpolated UV at any hit point gives us t directly. This is exact to within the interpolation precision of the triangle — far more accurate than the Line2 approach of projecting onto a segment and accumulating arc lengths.

### Why custom raycast on RibbonLine

The vertex shader expands centerline vertices by `halfWidth` to create the visible ribbon, but the CPU-side `BufferGeometry` positions remain at the centerline (effectively zero-width triangles). Three.js default `Mesh.raycast` performs ray-triangle intersection against the CPU geometry, which would never intersect. The custom `raycast()` bypasses triangle intersection entirely and instead tests pointer proximity to the spline curve, using `halfWidth` as the hit threshold.
