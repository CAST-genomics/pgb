# High-Resolution Export Options for Publication Figures

This document surveys options for producing print-resolution images of the PGB
application for an upcoming scientific paper. The application screen is a
composite of three distinct rendering technologies, which is the core
constraint shaping every option below.

## The three constituent layers

| Element | Technology | Implication for export |
|---|---|---|
| Annotation track (top) | 2D `<canvas>` with procedural draws (rects, lines, text) | Easy to re-render at any resolution; also a strong candidate for true SVG export. |
| Pan genome graph (center) | Three.js / WebGL — `RibbonNode` meshes + custom GLSL shaders | High-DPI raster is straightforward (resize renderer, render once, read pixels). True vector export is possible in principle but requires walking the spline data ourselves; `THREE.SVGRenderer` does not handle our custom shader meshes. |
| PCLAI Chart (right) | HTML `<div>` with a **576 × 576 PNG background** (`public/images/pca-chart-background.png`) + DOM-based scatter dots layered on top | A mishmash: vector-friendly DOM dots above a fixed-resolution bitmap. The dots are easy to vectorize; the background bitmap is the bottleneck. |

Because each layer is a different technology, **no single built-in function
captures all three at publication resolution**. Two fixed-resolution bitmap
assets sit inside otherwise-vectorizable layers and will be the first
artifacts to show up in a high-DPR render: the **576 × 576 PCLAI background
PNG**, and the **256 × 64 arrow alpha-matte texture** used by edge shaders.
Both have remediation paths described below (see §B.1 and §B.3). There are, however, two
realistic strategies: a one-shot whole-page capture, or per-element export
with compositing.

---

## Option A — Whole-page capture at elevated device pixel ratio

Drive the browser headlessly (Playwright or Puppeteer), set
`window.devicePixelRatio` to 3× or 4× the screen value, force a Three.js
re-render at the new backing-store size, and take a viewport screenshot.

### How it works
1. Launch Playwright with `deviceScaleFactor: 3` (or 4).
2. After page load, programmatically:
   - Call `renderer.setPixelRatio(window.devicePixelRatio)` and
     `renderer.setSize(width, height, false)` on the Three.js renderer.
   - Re-rasterize the annotation-track canvas at the new DPR (most 2D
     canvases need an explicit redraw — they don't auto-scale on DPR change).
   - Force a frame render.
3. `page.screenshot({ path, fullPage: false })` — output is N× the on-screen
   pixel dimensions.

### Pros
- Single capture; layout, overlap, z-order all match what you see.
- Repeatable from a script — easy to regenerate when data or styling changes.
- Captures the live, real composite (no fidelity drift between elements).

### Cons
- Output is rasterized. At 3× DPR a 1920-wide viewport yields ~5760 px wide,
  which is comfortably above 300 DPI for a figure up to ~8 in (≈19 cm) wide,
  but not infinitely scalable.
- Text in the annotation track is re-rasterized rather than remaining vector.
- Requires the canvases (especially the 2D annotation track) to honor the
  bumped DPR; some redraw plumbing may be needed.

### Effort
Low — roughly an afternoon of scripting plus a small amount of DPR-aware
redraw work for any 2D canvas that doesn't already handle it.

### When this is the right choice
The default. For most figures this clears typical journal print bars (300 DPI
at column width). Reach for Option B only when a reviewer pushes back, or for
hero figures where the graph and PCLAI chart need to print at large size.

---

## Option B — Per-element export, then composite

Export each layer at its highest-fidelity native format, then assemble in
Illustrator, Figma, Affinity Designer, or Inkscape.

### B.1 — Three.js pangenome graph

**Path 1: high-resolution raster (recommended starting point).**
- Save the current `renderer.getSize()` and `renderer.getPixelRatio()`.
- Resize the renderer to the target pixel dimensions (e.g. 6000 × 4000) via
  `renderer.setSize(W, H, false)`.
- Adjust the camera aspect ratio to match.
- Render one frame.
- `renderer.domElement.toBlob(blob => …, 'image/png')`.
- Restore the previous size.

The custom ribbon shader handles arbitrary resolutions naturally, so the
output looks exactly like the on-screen render, just sharper. Confirm
`preserveDrawingBuffer: true` on the renderer (or render-then-grab in the
same tick), otherwise the readback will be blank.

**Texture-resolution caveat (edge arrows).** The edges between nodes are
rendered as arrows whose shape is defined by an **alpha-matte texture**
(`src/assets/textures/arrow-margin-white.png`, currently **256 × 64**),
sampled by `shaders/arrow.frag.glsl` via `materialService.arrowMaterialFactory`
and `colorRampArrowMaterialFactory`. At normal viewport size the alpha
edges look crisp because each arrow's on-screen footprint is small. **At a
4× DPR render the on-screen footprint of every arrow grows ~4×**, and the
256 × 64 alpha matte starts to show stair-step softness along the
diagonals of the arrowhead. This is the most likely visible artifact in a
high-resolution capture of the graph.

Three remediation paths:
  1. **Re-export the arrow alpha matte at higher resolution.** The PSD
     source (`arrow-margin.psd`) and Sketch source (`arrow.sketch`) live
     next to the PNG. Re-export at 1024 × 256 (or 2048 × 512) and the
     existing material code picks it up unchanged. **Cheapest and
     recommended.** Verify `texture.minFilter` / `magFilter` and that the
     texture has mipmaps enabled (linear-mipmap-linear is the safe
     default).
  2. **Compute the arrowhead analytically in the fragment shader.** Define
     the arrow shape via signed distance from the centerline / tip in UV
     space; no texture sampling, perfect edges at any resolution. Best
     long-term answer; a few hours of shader work.
  3. **Swap to vector edge geometry for the export.** A one-off path:
     replace the textured-quad edges with thin meshes whose silhouette is
     the actual arrow polygon. Heavier and only worth it if the analytical
     shader is unappetizing.

If the figures only need 2× DPR and the arrows are small in frame, the
current 256 × 64 matte may pass without remediation — check the actual
output before investing in path 1 or 2.

**Path 2: true vector (SVG) export.**
The ribbon nodes are mathematically defined splines (`RibbonNode` knows the
control points). A custom exporter could walk each node's spline samples and
emit an SVG `<path>` per node, with stroke width matching `halfWidth`. This
yields infinitely scalable output and is the highest-fidelity option, but it
is a meaningful build — count it as a multi-day spike, not an afternoon.

`THREE.SVGRenderer` is **not** a viable shortcut here: it does not render
custom-shader meshes. The RibbonNode geometry would need a bespoke exporter.

### B.2 — Annotation track canvas

The annotation track draws procedural shapes (gene blocks, exon ticks, text
labels) with the 2D canvas API. Two good options:

**Option i — N× raster.** Allocate an offscreen canvas at N× width and
height, `ctx.scale(N, N)`, run the same draw routine, export PNG. Cheap,
sharp, and the existing draw code is reused unchanged.

**Option ii — SVG emission.** Refactor the draw routine to dual-target: when
called in "SVG mode" it accumulates `<rect>`, `<line>`, and `<text>` elements
instead of issuing canvas calls. This produces a true vector annotation
track — perfect for print — but requires touching the draw code. Worthwhile
if the annotation track recurs across many figures in the paper.

### B.3 — PCLAI chart

The PCLAI chart is a **mishmash of bitmap and DOM**:
- Background: a fixed 576 × 576 PNG
  (`public/images/pca-chart-background.png`) applied via SCSS in
  `src/styles/_pclaiChart.scss` (`background: white url(...) center / cover
  no-repeat`).
- Foreground: per-point `<div>` dots positioned absolutely
  (`src/widgets/pclaiChart.js`), plus reference dots in a sibling container.

The DOM dots vectorize trivially — the **bitmap background is what limits
print resolution**.

**The background bitmap problem.** At any chart-surface size much larger
than 576 px, `cover` upsamples the PNG and softens the gradient. For print,
this matters: a chart that prints at 6 in × 6 in @ 300 DPI wants 1800 ×
1800 px of background detail; the current asset has 576. Three remediation
paths, in increasing order of fidelity:

  1. **Re-export the background at higher resolution.** If the original is
     a procedural gradient (Photoshop / Figma / generated), re-export at
     2048 × 2048 or 4096 × 4096 and update the SCSS. Cheapest fix and
     usually sufficient.
  2. **Replace the PNG with an SVG gradient.** If the background is a
     smooth multi-stop gradient (it appears to be — green/cyan/pink/red
     quadrants), it's reproducible as an SVG `<linearGradient>` or
     `<radialGradient>` and becomes resolution-independent.
  3. **Recompute the gradient at export time.** If the gradient encodes
     PCLAI-space color semantics (i.e. the color at each pixel reflects
     position in PCLAI space), regenerate it in code at the target
     resolution rather than treating it as a static asset.

**Foreground dots — SVG export (recommended).** Build a small exporter
that:
- Reads `pclaiChart` dot data (already in `pclaiCoordinateSpace.js`).
- Emits an `<svg>` with:
  - The background — either an SVG gradient (path 2 above) or an
    `<image href="..." />` referencing a higher-resolution PNG (path 1).
  - One `<circle>` per dataset and reference dot, with the existing
    per-point color.
- Saves the SVG to disk.

**Fallback — `html2canvas`.** Lower fidelity, zero data-model work. Only
useful for a quick one-off, and it inherits the 576 px background limit.

### Compositing
Once each element is exported, drop the three pieces into Illustrator/Figma:
the SVGs scale freely, the rasters keep their resolution, and the layout can
be tuned (margins, callouts, paper-specific labels) without re-running the
app.

### Pros
- Highest possible quality, especially if SVG paths are used for the
  annotation track and PCLAI chart.
- Each element can be regenerated independently.
- Compositing tools let you add paper-specific annotations cleanly.

### Cons
- Real engineering effort for the SVG exporters.
- Compositing is manual — a step that doesn't survive data changes.
- Risk of subtle layout drift between exports and the on-screen composite
  (e.g. PCLAI chart position relative to the graph).

### Effort
Medium to high. Annotation-track N× raster and Three.js high-res raster:
each a few hours. PCLAI SVG exporter: half a day to a day. Three.js SVG
exporter: multi-day if pursued.

---

## Hybrid recommendation

The pragmatic path most papers end up on:

1. **Start with Option A** (Playwright at 3× or 4× DPR). Generate every
   figure this way first. Keep the script in `scripts/` so figures are
   reproducible.
2. **Promote individual elements to vector only when needed.** If a specific
   figure requires it — typically the PCLAI chart or the annotation track in
   close-up insets — add an SVG exporter for that element and composite.
3. **Leave the Three.js graph as raster** unless a reviewer specifically
   demands vector. The high-DPR raster is normally indistinguishable from
   vector at print sizes, and the SVG exporter for the ribbon meshes is the
   most expensive piece of work in the whole space.

## Decision checklist

- Is this a figure that prints at column width (~3.5 in)? → Option A is
  almost certainly enough.
- Will the figure print at full page width or as a fold-out? → Use Option A
  at 4× DPR and inspect; consider promoting the PCLAI chart and annotation
  track to SVG.
- Is the figure being submitted to a journal that requires vector for
  non-photographic elements (some do)? → Option B for the chart and
  annotation track; Option A high-DPR raster for the graph, with a written
  note that the graph is a 3D scientific visualization.
- Do you need to regenerate this figure many times as data evolves? →
  Option A (scripted) + saved Playwright command beats per-element export.

## Related files in this repo

- `src/widgets/pclaiChart.js` / `pclaiChartController.js` — PCLAI chart rendering.
- `src/ribbonNode.ts` — RibbonNode mesh; custom shader; spline geometry.
- `src/ribbonMaterialFactory.js` — ShaderMaterial uniforms.
- `shaders/ribbon.vert.glsl` / `ribbon.frag.glsl` — vertex/fragment shaders.
- `scripts/` — natural home for a `scripts/export-figure.mjs` Playwright
  driver.
