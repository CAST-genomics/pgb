# Ribbon Mesh Spike — Implementation Plan

**Status:** Phase 1 implemented — see [ribbon-mesh-spike-implementation.md](./ribbon-mesh-spike-implementation.md)
**Date:** 2026-03-10

## Motivation

Replace the Three.js Line2/LineMaterial pipeline for node rendering with a custom triangle-strip "ribbon mesh" and custom shaders. The Line2 infrastructure introduces unnecessary complexity for our use case:

- Endcap geometry (`position.y < 0 / > 1`) that pollutes UVs
- Segment-level instancing when we need whole-node parameterization
- `closestLineToLine` world-space distance computation in the fragment shader
- Interleaved `instanceStart/instanceEnd` buffers that complicate emphasis z-offsets

Our nodes are simpler: flat strips in the orthographic XY plane with constant pixel width. A custom mesh lets us own every coordinate.

## Core Idea

A **triangle strip** along the spline centerline. Two vertices per sample point (one each side), offset perpendicular to the path tangent. The offset happens in the vertex shader using a single `halfWidth` uniform updated per frame from the orthographic frustum.

## Geometry (built once at load time)

Per vertex attributes:
- `position` (vec3) — the centerline point on the spline (not offset yet; offset happens in vertex shader)
- `normal2d` (vec2) — perpendicular direction in XY plane, precomputed on CPU since geometry never changes
- `uParam` (float) — arc-length parameterized 0→1 along the entire node
- `side` (float) — +1.0 or -1.0 (which side of the ribbon this vertex is on)

### Adaptive Tessellation

Rather than a fixed division count (the current `spline.getPoints(32)`), the ribbon uses curvature-adaptive sampling. This places more vertices where the spline curves tightly and fewer on straight runs. Since geometry is built once at load time, the cost is negligible.

**Algorithm — recursive subdivision with curvature threshold:**

```
adaptiveSample(spline, tStart, tEnd, pStart, pEnd, samples, maxDepth):
  tMid = (tStart + tEnd) / 2
  pMid = spline.getPoint(tMid)

  // Flatness test: distance from midpoint to the straight line between endpoints
  midDeviation = distancePointToLine(pMid, pStart, pEnd)

  if midDeviation > FLATNESS_TOLERANCE or depth < MIN_DEPTH:
    // Curve is not flat enough — subdivide both halves
    adaptiveSample(spline, tStart, tMid, pStart, pMid, samples, maxDepth - 1)
    samples.push({ t: tMid, point: pMid })
    adaptiveSample(spline, tMid, tEnd, pMid, pEnd, samples, maxDepth - 1)
  // else: segment is flat enough — skip midpoint (endpoints already in list)
```

**Parameters:**
- `FLATNESS_TOLERANCE` — max deviation in world units before subdividing (tune to visual quality; start with ~0.5 world units)
- `MIN_DEPTH` — minimum recursion depth to guarantee a baseline sample density (e.g. 3 → at least 8 segments)
- `MAX_DEPTH` — recursion cap to prevent runaway subdivision (e.g. 8 → at most 256 segments)

**Why this works well here:**
- Long straight nodes → few triangles (most midpoints pass the flatness test)
- Short tight curves → dense triangles (midpoints deviate, triggering subdivision)
- The `MIN_DEPTH` floor ensures even straight nodes have enough geometry for smooth UV interpolation
- The `MAX_DEPTH` cap bounds worst-case vertex count

**Output:** A sorted array of `{ t, point }` samples, with `t` values providing the arc-length parameterization for `uParam`.

### Vertex Construction

Given the adaptively-sampled points P[0..N-1] with parameters t[0..N-1]:

```
For each sample point P[i] at arc-length parameter t[i]:
  1. Compute tangent T[i] = normalize(P[i+1] - P[i-1])  (central difference)
     For endpoints: T[0] = normalize(P[1] - P[0]), T[N-1] = normalize(P[N-1] - P[N-2])
  2. Compute 2D normal N[i] = (-T[i].y, T[i].x, 0)  (perpendicular in XY plane)
  3. Create two vertices:
     - Top vertex: position=P[i], normal2d=N[i], uParam=t[i], side=+1
     - Bottom vertex: position=P[i], normal2d=N[i], uParam=t[i], side=-1
```

### Index Buffer

Standard quad indexing, N-1 quads from N sample points:
```
For quad i (between sample i and sample i+1):
  top-left  = 2*i,      top-right  = 2*(i+1)
  bot-left  = 2*i + 1,  bot-right  = 2*(i+1) + 1
  Triangle 1: [2*i, 2*i+1, 2*(i+1)]
  Triangle 2: [2*i+1, 2*(i+1)+1, 2*(i+1)]
```

No endcaps. The ribbon simply starts and stops at the first and last sample points.

## Shaders

### Vertex Shader (`shaders/ribbon.vert.glsl`)

```glsl
uniform float halfWidth;  // world-space half-width, updated per frame

attribute vec2 normal2d;  // precomputed perpendicular direction (unit length)
attribute float uParam;   // 0->1 along arc length
attribute float side;     // +1 or -1

varying vec2 vUv;         // UV for texture sampling

void main() {
    vec3 pos = position;
    pos.x += normal2d.x * side * halfWidth;
    pos.y += normal2d.y * side * halfWidth;

    // u runs along node (0->1), v runs across width (0->1)
    vUv = vec2(uParam, side * 0.5 + 0.5);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### Fragment Shader (`shaders/ribbon.frag.glsl`)

```glsl
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D alphaMap;   // optional canvas texture (alpha matte)
uniform float useAlphaMap;    // 0.0 or 1.0 toggle

varying vec2 vUv;

void main() {
    float alpha = opacity;

    if (useAlphaMap > 0.5) {
        alpha *= texture2D(alphaMap, vUv).a;
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(diffuse, alpha);
}
```

## Constant Width on Zoom

With an orthographic camera this is trivial — one uniform, one line of math:

```javascript
halfWidth = pixelWidth * (camera.top - camera.bottom) / canvasHeight / 2;
```

Updated per frame alongside the existing resolution service. No per-fragment distance computation needed.

## Raycasting — Free t-Parameter

Three.js mesh raycasting returns UV coordinates at the intersection point. Since we define `uv.x = uParam` (the arc-length parameter 0→1), the t-parameter comes for free from the intersection — no arc-length table binary search needed.

```javascript
static getParameter(intersection) {
    const { object, uv } = intersection;
    return { t: uv.x, nodeName: object.userData.nodeName, ...intersection };
}
```

## Canvas Textures (Phase 2)

### Existing Asset: `src/lineCanvasTextureFactory.js`

Already in the working tree with four texture plugins:
- `createSolidTexture(width, height)` — full alpha fill
- `createOutlineTexture(borderWeight, padding, width, height)` — rectangular border
- `createDashedTexture(dashRatio, repeats, width, height)` — dash pattern
- `createDottedTexture(dotRadius, repeats, width, height)` — dot pattern

Plus singleton getters (`getSolidTexture`, `getOutlineTexture`, `getDashedTexture`).

All functions already accept `width` and `height` parameters — the factory is ready for per-node sizing.

### Why this works better with the ribbon than it did with Line2

The ribbon has clean `uv = (0→1, 0→1)` — canvas X maps along the node, canvas Y maps across the width. No endcap geometry distortion, no `vUv` values going to -2/+2 in cap regions. The texture samples exactly as the factory intends.

### Per-node aspect ratio matching

To avoid stretching artifacts, each node's canvas texture should have dimensions proportional to its display aspect ratio:

```
arcLength = geometry.userData.totalArcLength   // world units, fixed
displayWidth = NODE_LINE_WIDTH_PIXELS          // pixels, constant

// Texel density: how many canvas pixels per world unit along the node
texelsPerWorldUnit = some constant (e.g. 2.0)

canvasWidth = clamp(ceil(arcLength * texelsPerWorldUnit), 16, 2048)
canvasHeight = clamp(ceil(displayWidth), 4, 64)
```

Since nodes never change size, these are computed once at load time. Short nodes get small canvases, long nodes get large ones — texels stay roughly square on screen.

The singletons (`getSolidTexture` etc.) can still be used as shared defaults when aspect ratio precision isn't needed (e.g. solid fill looks identical regardless of aspect ratio).

## File Plan

| File | Action | Description |
|------|--------|-------------|
| `shaders/ribbon.vert.glsl` | **New** | Vertex shader: offset by normal2d × side × halfWidth |
| `shaders/ribbon.frag.glsl` | **New** | Fragment shader: diffuse color + optional alpha matte |
| `src/ribbonLine.js` | **New** | THREE.Mesh subclass with `getPoint(t)` and `getParameter(intersection)` |
| `src/ribbonMaterialFactory.js` | **New** | ShaderMaterial factory + `computeHalfWidth` utility |
| `src/lineFactory.js` | **Modify** | Add `createNodeRibbonGeometry()` with adaptive tessellation alongside existing `createNodeLineGeometry()` |
| `src/geometryFactory.js` | **Modify** | Produce ribbon geometry in `#createNodeGeometries` |
| `src/geometryManager.js` | **Modify** | Wire ribbon path, skip arcLengthTable for ribbon meshes, pass spline in context |
| `src/looks/look.js` | **Modify** | Add `createNodeRibbonMesh`, `getNodeRibbonMaterial`, `USE_RIBBON` toggle flag |
| `src/lineMaterialResolutionService.js` | **Modify** | Add `ribbonMaterials` Set, update `halfWidth` uniform in `update()` |
| `src/raycastService.js` | **Modify** | Detect `RibbonLine` in `#processIntersection`, use UV-based t recovery |
| `src/lineCanvasTextureFactory.js` | **Existing** | Alpha-matte canvas texture factory — already in tree, reuse as-is for Phase 2 |

## Build Order

1. **Shaders** — `ribbon.vert.glsl` + `ribbon.frag.glsl`
2. **`lineFactory.js`** — Add `createNodeRibbonGeometry()` with adaptive tessellation, test with a known spline
3. **`ribbonMaterialFactory.js`** + **`ribbonLine.js`** — Material factory and mesh subclass
4. **`lineMaterialResolutionService.js`** — Add ribbon material registration + `halfWidth` update
5. **`look.js`** — Add ribbon mesh creation methods + `USE_RIBBON` flag
6. **`geometryFactory.js`** + **`geometryManager.js`** — Wire ribbon geometry into pipeline
7. **`raycastService.js`** — Handle `RibbonLine` intersections
8. **End-to-end test** — Load data, verify rendering, zoom (constant width), hover (t-parameter), emphasis (color change)

## What Stays Unchanged

- Spline creation from `ogdf_coordinates` (CatmullRomCurve3)
- Coordinate centering / bounding box computation
- Edge rendering (existing quad mesh + arrow shader)
- Look system architecture (one look per scene, LookManager registry)
- Scene switching / MRT pattern (meshes pre-created for all scenes)
- Camera management (orthographic)

## Potential Challenges

1. **Miter joins at sharp bends** — At sharp angles, adjacent quads can overlap or gap. Adaptive tessellation mitigates this by placing more samples in high-curvature regions, keeping the angle between adjacent segments small. If visible artifacts remain at extreme bends, fix by averaging normals at shared vertices (miter computation).

2. **UV seams at quad boundaries** — `uParam` is continuous and monotonic, so no discontinuities expected. Bilinear filtering handles boundaries cleanly.

3. **Bounding box for camera framing** — `updateViewToFitScene` checks `object.isLine2` for nodes. Ribbon meshes are standard `THREE.Mesh` and will be caught by the `object.isMesh` branch — works without changes.

4. **Emphasis z-offsets** — Use `mesh.position.z` offset (like edge meshes) instead of modifying geometry buffer attributes. Simpler than the current `instanceStart/instanceEnd` approach.

## Comparison: Line2 vs Ribbon

| Aspect | Line2/LineMaterial | Ribbon Mesh |
|--------|-------------------|-------------|
| Geometry | Segment-instanced, endcaps | Simple triangle strip, no endcaps |
| UV parameterization | Bolt-on (`instanceParamStart/End`) | Native (`uParam` attribute) |
| Constant width | `closestLineToLine` in fragment shader | Single uniform multiply in vertex shader |
| Fragment shader | ~100 lines (distance, dashes, caps) | ~8 lines (color + optional texture) |
| Raycasting | Custom `Line2` raycast + arc-length table | Standard mesh raycast, t from UV |
| Emphasis z-offset | Modify interleaved buffer attributes | `mesh.position.z` |
| Canvas textures | Coordinate system mismatch at borders | Clean 0→1 UV, aspect-ratio-matched textures |
