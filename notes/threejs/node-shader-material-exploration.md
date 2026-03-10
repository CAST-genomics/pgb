# Node Shader Material Exploration

Branch: `hprc-project-custom-assemblies-node-shader-hacks`
Worktree: `/Users/turner/PanGenomeProject/pgb-node-shader-hacks/`

## Goal

Replace the stock Three.js `LineMaterial` used for node rendering with custom shader materials that allow fine-grained visual control — outlines, dashes, dots, and arbitrary canvas-painted styles — while maintaining the Line2/ParametricLine geometry pipeline and world-units width control.

## What Was Built

### Two custom materials, sharing one vertex shader:

1. **TexturedLineMaterial** (`src/texturedLineMaterial.js`)
   - Fragment shader: `shaders/textured-line.frag.glsl`
   - Alpha-matte approach: texture alpha = holdout shape, diffuse color = tint
   - Swap canvas textures to change visual style (solid, dashed, dotted)
   - Canvas texture factory: `src/lineCanvasTextureFactory.js`

2. **ProceduralLineMaterial** (`src/proceduralLineMaterial.js`)
   - Fragment shader: `shaders/procedural-line.frag.glsl`
   - No textures — computes borders mathematically in the shader
   - `borderWidth` uniform: top/bottom border as fraction of line width
   - `endBorderWorldSize` uniform: start/end border in fixed world units

### Shared vertex shader: `shaders/textured-line.vert.glsl`
- Forked from Three.js LineMaterial, locked to WORLD_UNITS mode
- Added per-instance attributes for whole-node parameterization:
  - `instanceParamStart` / `instanceParamEnd` — normalized 0→1 along entire node
  - `instanceNodeArcLength` — total arc length in world units
- Varyings passed to fragment: `vAlongLine`, `vNodeArcLength`, `vUv`, world-space positions

### Geometry augmentation: `src/geometryManager.js`
- After building arc length tables, adds the three per-instance attributes above

### Line width simplification
- Removed competing `NODE_LINE_WIDTH` (world units) and `NODE_LINE_DEEMPHASIS_WIDTH` constants
- Single source of truth: `Look.NODE_LINE_WIDTH_PIXELS = 2*2*2` (8 screen pixels)
- `lineMaterialResolutionService.update()` converts to world units per frame on all materials

### Canvas texture factory: `src/lineCanvasTextureFactory.js`
- Plugin architecture: each function paints white-on-transparent canvas → alpha matte
- Functions: `createSolidTexture`, `createOutlineTexture`, `createDashedTexture`, `createDottedTexture`
- Singletons: `getSolidTexture`, `getOutlineTexture`, `getDashedTexture`
- Textures use `ClampToEdgeWrapping` (no tiling)

## Current State

- **TexturedLineMaterial with solid texture**: works perfectly, visually identical to stock LineMaterial
- **TexturedLineMaterial with outline texture**: aspect ratio distortion at start/end of nodes (rounded rect and rectangular outlines both suffer from this)
- **ProceduralLineMaterial outline**: top/bottom borders work great; start/end borders still exhibit zoom-dependent thickness

## The Open Problem: Start/End Border Consistency

### The fundamental tension

The line width is maintained at a **constant screen-pixel size** by `lineMaterialResolutionService`, which recalculates the world-unit `linewidth` every frame based on zoom level. This means:

- The **cross-line (width) dimension** is in a zoom-adaptive reference frame — `linewidth` in world units changes, but the on-screen appearance is fixed
- The **along-line (length) dimension** is in a fixed world-space reference frame — `nodeArcLength` never changes

These two dimensions live in fundamentally different coordinate systems. Any border defined as a fraction of one will not match a border defined as a fraction of the other, because they scale differently with zoom.

### What this looks like

- **Zoomed out**: `linewidth` (world units) is large → start/end borders computed from `linewidth` appear fat relative to the node length
- **Zoomed in**: `linewidth` (world units) is small → start/end borders appear thin
- The top/bottom borders always look correct because they're fractional within the zoom-adaptive width

### Approaches tried

1. **`linewidth * borderWidth / nodeArcLength`** — zoom-dependent because `linewidth` changes per frame
2. **`endBorderWorldSize / nodeArcLength`** (fixed world units) — should be zoom-independent, but the visual result is still inconsistent (needs further investigation — may be a different issue at the endcap geometry level)
3. **`borderWidth` as same fraction for both axes** — makes short nodes have huge end borders, long nodes have invisible ones

### Possible directions to explore

- **Investigate the Line2 endcap geometry**: The base quad has endcap vertices at `position.y < 0` and `position.y > 1`. These extend the quad beyond the segment endpoints. The `vUv` values in endcap regions go to -2/+2. This geometry expansion may be contributing to the visual fattening at the ends, separate from the border calculation itself.

- **Screen-space approach for end borders**: If we could get the node's screen-space length in the shader (via a uniform updated per frame, similar to how `linewidth` is updated), we could compute end borders in screen pixels, matching the cross-line behavior exactly.

- **Hybrid approach**: Only draw top/bottom borders procedurally (which works perfectly), and skip start/end borders entirely. The Line2 endcap rounding already provides a visual terminus. This sacrifices the full rectangular outline but may be the pragmatic choice.

- **Two-pass rendering**: Render the outline as a separate, slightly larger solid line behind the main line. The "border" is the visible sliver of the back line. This avoids the parameterization problem entirely.

## File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `shaders/textured-line.vert.glsl` | New | Shared vertex shader (WORLD_UNITS + whole-node params) |
| `shaders/textured-line.frag.glsl` | New | Alpha-matte texture sampling fragment shader |
| `shaders/procedural-line.frag.glsl` | New | Procedural outline fragment shader |
| `src/texturedLineMaterial.js` | New | ShaderMaterial for texture-based styles |
| `src/proceduralLineMaterial.js` | New | ShaderMaterial for procedural styles |
| `src/lineCanvasTextureFactory.js` | New | Canvas texture plugin factory |
| `src/geometryManager.js` | Modified | Adds per-instance param/arcLength attributes |
| `src/looks/look.js` | Modified | Uses TexturedLineMaterial for normal + emphasis |
| `src/materialService.js` | Modified | Uses ProceduralLineMaterial for deemphasis |
