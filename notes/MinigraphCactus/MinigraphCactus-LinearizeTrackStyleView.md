# Why a linearized, track‑style view for Minigraph‑Cactus

**Audience:** pangenome graph tool builders and IGV/Spacewalk users

**TL;DR**
For minigraph‑cactus data, a *reference‑projected, linear track* with multi‑scale summarization is more interpretable and vastly more renderable than a 2D “cactus” layout. Geometry in the cactus view is an artifact of layout; bp distance, order, and event salience are better communicated on a linear spine with local *pills/bubbles* and on‑demand micro‑graphs.

---

## The problem we’re solving

* In typical loci (e.g., 220,001 bp), **\~75% of nodes are ≤ \~13 bp**. That’s millions of sub‑pixel features at common zooms.
* Global 2D graph shapes are **not** proportional to basepair (bp) distance or genomic order; bends/loops reflect the layout algorithm, not biology.
* Users want to answer “where on the reference?” and “what diverges here?”—questions that are naturally linear.

---

## Design principles

1. **Semantics on the x‑axis**: Make `x` = reference bp. Width of any glyph encodes bp length.
2. **Topology on demand**: Show local structure *within* a selected bubble via a micro‑graph, not as a global hairball.
3. **Multi‑scale by construction**: Aggregate tiny nodes into runs at the current bp/px so the view is always legible.
4. **One‑mesh rendering**: Keep the scene graph tiny; move detail into textures/instances (GPU‑friendly).

---

## Proposed view (what the user sees)

* **Spine ribbon (primary track):** the chosen reference/assembly path as a thick ribbon. Color encodes along‑spine attributes (coverage, alt frequency, graph depth, etc.).
* **Pills & bubbles:** rounded capsules on/near the spine marking alt paths, small indels, inversions, duplications. Height encodes degree (number of paths/divergence).
* **Local micro‑graph (on demand):** clicking a pill opens a straightened bubble view aligned to the spine coordinate.
* **Optional lanes:** per‑assembly lanes (like IGV tracks) highlight where each assembly diverges/rejoins.
* **Loupe:** a docked magnifier for sub‑pixel nodes without distorting the global context.
* **Mini‑map:** a tiny cactus overview purely for orientation/QA.

---

## Rendering plan (WebGL/Three.js)

**Goal:** constant‑ish draw calls; scale to millions of tiny nodes.

1. **One ribbon mesh**
   Use a stroked polyline (Line2 or custom). Vertex attribute = cumulative arc‑length; normalize to `u ∈ [0,1]` per tile.

2. **LOD via 1D LUTs**
   At any zoom, compute `bpPerPixel`. Bin consecutive nodes until bin length ≥ 1 px worth of bp (user‑tunable). Rasterize bins into a 1D DataTexture (color) + parallel 1D ID‑texture for picking. Fragment shader samples `texture(lut, u)` to color the ribbon—no per‑node geometry.

3. **Instanced pills**
   Only bins/events surviving the current LOD become **instances** with attributes `(uStart, uEnd, type, importance)`. The shader expands a capsule in screen‑space; CPU culls off‑screen instances.

4. **Smooth zoom**
   Maintain a small texture pyramid for common bp/px bands and cross‑fade in the shader to avoid popping.

5. **Tiling**
   Tile by world‑space bounds of the layout. Each tile = decimated polyline + a handful of 1D LUTs (few KB). Load/unload by frustum.

6. **Picking**
   Raycast the ribbon → `u` → sample ID‑LUT. If the texel represents an aggregate bin, the tooltip lists constituent nodes; “Zoom here” refines the LOD.

---

## Data interface (from PangenomeService)

**Linear mapping** (monotonic along the chosen spine):

* `nodeId, pathId`
* `bpStart, bpEnd` on spine coordinate (may be reversed)
* `uStart, uEnd` ∈ \[0,1] (per‑tile normalization)

**Events** (grouped alt structures):

* `type`: `bubble | indel | inversion | duplication | break`
* `spanBp, pathsCount, divergenceScore`
* `members`: list of nodeIds (for detail popover)
* Optional: aggregate annotations (genes, repeats), counts per assembly

**Zoom bands** (pre‑binned runs):
For bands like `{0.5, 1, 2, 4, 8} bp/px`, store `runs = [{u0,u1,color,idsSummary}]`.

---

## Side‑by‑side figure (drop into repo)

> Put these two images next to each other in your README/wiki:

1. **Cactus overview** (left): a typical minigraph‑cactus layout.
   *Use your screenshot: `docs/img/minigraph-cactus.png`*

2. **Reference‑projected ribbon with LOD** (right): a mock that shows the spine track with colored along‑spine ribbon + a few capsules; an inset micro‑graph for a selected bubble; a tiny loupe showing sub‑pixel nodes resolved at high zoom.
   *File placeholder: `docs/img/ribbon‑lod.png`*

Suggested caption:
*“Global 2D cactus geometry is hard to interpret (shape/length ≠ bp). A reference‑projected ribbon keeps bp semantics on the x‑axis; tiny nodes are summarized into runs at low zoom and revealed via a loupe or on‑demand micro‑graph.”*

---

## Interaction sketch

* Hover → tooltip with `bp`, event type, paths count; light path highlight.
* Click pill → open micro‑graph; click ribbon → set focus for the loupe.
* Brush to link with IGV tracks (genes, repeats, coverage) and Spacewalk views.

---

## Implementation checklist

* [ ] Spine polyline + arc‑length attribute
* [ ] Zoom‑aware binning and LUT builder (color + ID)
* [ ] Ribbon shader (samples LUT by `u`; cross‑fades between bands)
* [ ] Instanced capsule shader (screen‑space thickness; rounded caps)
* [ ] CPU culling + world‑space tiling
* [ ] Picking via ID‑LUT; detail popover + micro‑graph panel
* [ ] Loupe component synced to cursor
* [ ] IGV/Spacewalk link‑out for the brushed interval

---

## Why this works

* **Interpretability:** bp‑aligned x‑axis matches user questions.
* **Scalability:** millions of tiny nodes collapse into **texture samples**, not scene‑graph objects.
* **Topology when needed:** micro‑graphs preserve graph thinking without sacrificing overview or performance.

---

## Appendix: quick LOD math

* `bpPerPixel = extentBp / screenWidthPx` (per view).
* Minimum visible length at 1 px: `Lmin = max(1, pxMin) × bpPerPixel`.
* Merge consecutive nodes until their combined bp ≥ `Lmin` *or* type/color boundary.

---

**Image placeholders**

```
![Cactus layout](docs/img/minigraph-cactus.png)
![Ribbon with LOD](docs/img/ribbon-lod.png)
```

> Replace `ribbon‑lod.png` with a quick mock; the cactus image is available from your dataset screenshot.
