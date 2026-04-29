# High-Resolution Image Export Strategy

This document describes the export strategy implemented in PGB for producing
publication-quality figures of the on-screen composite. The companion document
`high-resolution-export-options.md` surveys the design space and explains the
constraints; this document records the choices we made and where they live in
the code.

## Surface area

The print menu (`pgb-print-menu` in `index.html`, mounted via
`mountPrintPanel` in `src/widgets/printPanel.ts`) exposes three export
buttons, one per layer of the on-screen composite:

| Button | Output | Implementation |
|---|---|---|
| Export Annotation Track (PNG, 8×) | PNG raster | `AnnotationCanvas.exportToPng(scale)` (`src/annotationCanvas.ts`) |
| Export Pangenome Graph (PNG, 4×)  | PNG raster | `App.exportPangenomeGraphToPng(scale)` (`src/app.ts`) |
| Export PCA Chart (SVG)             | True SVG  | `PcaChart.exportToSvg()` (`src/widgets/pcaChart.js`) |

Wiring lives in `src/main.js`, alongside the shared `EXPORT_SCALE` constant
and the `downloadBlob` / `timestampedFilename` helpers in
`src/utils/downloadBlob.ts`. Each button is identical in shape: the `run`
callback awaits a `Blob` from the layer's exporter and hands it to
`downloadBlob` with a timestamped filename.

The three exporters share a return contract — `Promise<Blob>` — so the print
panel doesn't need per-layer logic, and any future export channel
(Playwright capture, server-side renderer) can plug into the same surface.

## Strategy by layer

### 1. Annotation track — N× raster from an offscreen 2D canvas

The annotation track is procedurally drawn with the 2D canvas API (gene
blocks, exon ticks, text labels). The exporter creates an offscreen
`<canvas>` at `scale × scale` the on-screen pixel dimensions, calls
`ctx.scale(scale, scale)` so the existing draw routine renders at native
units, re-runs the same `featureRenderer.draw(...)` call against the
offscreen context, then returns a PNG via `canvas.toBlob`.

**Why this works:** the bp-to-pixel mapping is preserved (logical width /
viewport width / `bpPerPixel` are untouched); only the backing-store
resolution increases. Text and lines are re-rasterized at higher density,
so labels and exon ticks stay crisp.

**Limits:** raster output. At very large print sizes the text is still
sharp because it was re-rasterized at scale, but the file remains a bitmap.
A vector-emission variant (dual-target draw routine producing `<rect>` /
`<line>` / `<text>` instead of canvas calls) is a future option if a
journal demands SVG; see `high-resolution-export-options.md` §B.2 option
ii.

### 2. Pangenome graph — high-DPR raster from the Three.js renderer

The pangenome graph is rendered by Three.js with custom GLSL shaders
(`RibbonNode` meshes), so neither `THREE.SVGRenderer` nor a DOM walker is
viable. The exporter takes the high-DPR raster path described in
`high-resolution-export-options.md` §B.1 path 1.

**Sequence (in `App.exportPangenomeGraphToPng`):**

1. Save current `renderer.getPixelRatio()` and `renderer.getSize(...)`.
2. `stopAnimation()` to halt the render loop.
3. `renderer.setPixelRatio(1)` and
   `renderer.setSize(W * scale, H * scale, false)` — the third argument
   suppresses style updates so the on-screen `<canvas>` doesn't reflow and
   the rest of the page layout is untouched.
4. The orthographic camera's aspect ratio is unchanged by the resize, so
   no camera math is needed.
5. `renderer.render(scene, camera)` — one frame at the new backing-store
   size.
6. `renderer.domElement.toBlob(..., 'image/png')` for the readback.
7. In the `toBlob` callback (and the `try`/`catch` failure path):
   restore previous pixel ratio and size, then `startAnimation()` to
   resume the loop.

**Critical fix: `preserveDrawingBuffer: true`.** The renderer is
constructed in `src/rendererFactory.js` with this flag set. Without it,
the WebGL backbuffer can be cleared between the `render` call and the
`toBlob` readback on some drivers, producing a blank file. This was the
root cause of an earlier failed attempt and the reason this fix is the
first line item in the strategy.

**Scale ceiling.** `EXPORT_SCALE` is currently `4`. We tried `8` and the
output came back blank because the requested canvas exceeds the browser's
per-canvas pixel-area cap (typically ~268 M pixels on Chrome/Safari):
8× a 1920×1080 viewport is 15360×8640. If we need higher fidelity than
4× the natural next step is tiled rendering — render multiple smaller
frames with shifted orthographic frustums and stitch in JS — which
escapes the per-canvas limit entirely. Not implemented.

**Edge arrow alpha matte.** Edges are drawn through a 256×64 alpha-matte
texture (`src/assets/textures/arrow-margin-white.png`). At 4× the
arrowheads can show stair-step softness; at print sizes used in the paper
this has not been an issue. Remediation paths are documented in
`high-resolution-export-options.md` §B.1 — re-export the matte at higher
resolution (cheapest), or compute the arrow analytically in the fragment
shader (best long-term).

### 3. PCA chart — true SVG by walking the live DOM

The PCA chart is the only layer where vector output is straightforward
because every foreground element is already a positioned `<div>`. The
exporter walks the chart's DOM and emits an `<svg>` rather than
re-implementing the projection from data.

**What gets emitted (in order, so dataset dots paint on top):**

- `<svg viewBox="0 0 surfaceW surfaceH" width="surfaceW" height="surfaceH">`.
  Surface dimensions come from the chart's `PcaCoordinateSpace`
  (`surfaceWidth` / `surfaceHeight`).
- `<image href="data:image/png;base64,...">` covering the surface,
  `preserveAspectRatio="xMidYMid slice"` to mimic the SCSS
  `background: ... center / cover` behavior. The PNG is fetched at
  export time from `/images/pca_background_576_flipped.png` and
  base64-encoded inline so the SVG file is self-contained.
- One `<line>` per axis. Position and length read from the live axis
  `<div>`'s inline `style.left` / `top` / `width` / `height`.
- One `<circle>` per reference dot
  (`.pca-chart__reference-dot` inside the reference container).
- One `<circle>` per dataset dot (`.pca-chart__dot` inside the chart
  surface).

**Why DOM-walk instead of re-projecting from data:** the chart already
owns the projection logic, runs it once on `renderDots` /
`renderReferenceDots`, and bakes the results into the DOM. Re-projecting
in the exporter would require caching the source coordinate maps and
reference array on `PcaChart`, widening the change. Walking the DOM
gives exactly what's on screen with one extra method and zero new state.

**Robustness against transient state.** Each circle's `fill` comes from
the dot's `dataset.originalColor`, which is set at render time and
preserved across hover/desaturation. So if the user has a hover in
progress at click time — which would have desaturated other dots and
enlarged the hovered one — the export still emits the idle-state colors
and sizes. The hovered dot's enlarged width still passes through
`circleSvgFromDot` unchanged; this is acceptable because users export
from the idle state in practice.

**Background bitmap is the fidelity ceiling.** The PNG is embedded
byte-for-byte at its native 576×576 — no upscaling occurs in the
exporter. SVG renderers will resample the bitmap when the figure is
enlarged, so very large print sizes will show resolution mismatch
between crisp vector dots and a softening gradient background. This is
the known limit; `high-resolution-export-options.md` §B.3 documents
three upgrade paths: re-export the PNG at higher resolution, replace it
with an SVG `<linearGradient>`, or regenerate the gradient
programmatically at export time.

## Shared infrastructure

- **Filename convention:** `<layer>-<ISO timestamp>.<ext>` via
  `timestampedFilename(prefix, ext)` so multiple exports don't clobber
  each other.
- **Download path:** `downloadBlob(blob, filename)` (in
  `src/utils/downloadBlob.ts`) creates an object URL, clicks a hidden
  `<a download>`, and revokes the URL.
- **Status feedback:** `PrintPanel` (`src/widgets/printPanel.ts`)
  renders an `Exporting…` / `Saved.` / `Error: …` line under each
  button and disables the button while its `run` promise is in flight.

## What we explicitly did not do

These were considered and deferred. They are documented here so a
future engineer can pick them up without re-deriving the trade-offs.

- **Whole-page Playwright capture (Option A in the survey doc).** Would
  produce a single composite at the cost of needing every 2D canvas
  to honor a bumped DPR. Per-layer export is a smaller blast radius
  and gives designers the freedom to recompose in Illustrator/Figma.
- **Three.js SVG export of the pangenome graph (Option B.1 path 2).**
  Multi-day spike to write a custom RibbonNode-spline-to-SVG-path
  exporter. Not warranted unless a reviewer demands vector for the
  graph.
- **Tiled high-resolution graph render.** Would escape the per-canvas
  pixel-area cap and let us go past 4×. Not needed for current paper
  sizes.
- **Annotation-track SVG emission.** Possible by refactoring the draw
  routine to dual-target. Worthwhile if the track recurs across many
  figures at very large sizes; the 8× raster is sharp at column-width
  print sizes.
- **PCA background as SVG gradient.** The most likely upgrade if a
  reviewer pushes back on the resampled background bitmap.

## Related files

- `src/widgets/printPanel.ts` — print menu UI and per-entry status.
- `src/main.js` — wires the three exporters into the print menu and
  defines `EXPORT_SCALE`.
- `src/utils/downloadBlob.ts` — `downloadBlob`, `timestampedFilename`.
- `src/annotationCanvas.ts` — `exportToPng(scale)` for the
  annotation track.
- `src/app.ts` — `exportPangenomeGraphToPng(scale)` for the Three.js
  graph.
- `src/rendererFactory.js` — `WebGLRenderer` config including the
  `preserveDrawingBuffer: true` flag the graph export depends on.
- `src/widgets/pcaChart.js` — `exportToSvg()` for the PCA chart, plus
  the `circleSvgFromDot` and `fetchBackgroundAsDataUri` helpers.
- `src/widgets/mountPcaChart.js` — facade that re-exposes
  `exportToSvg` on the chart handle consumed from `main.js`.
- `high-resolution-export-options.md` — original options survey.
