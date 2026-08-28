---
status: accepted
date: 2026-08-13
measured: 2026-08-14
revised: 2026-08-16
migrated: 2026-08-17
---

# The viewer interprets the server's geometry, and draws it with WebGL

> **Migrated from the spike, 2026-08-17.** This decision was made and measured in
> [`CAST-genomics/sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike),
> where it was `docs/adr/0001`; it is renumbered **0002** here because PGB's `0001` is
> [the panel decision](0001-sequence-tube-map-panel.md) that admits this code into the app.
> It binds the tube map code and nothing else. Three reading notes, because the text is
> left as it was written rather than rewritten into PGB's frame.
>
> **The same three notes read the migrated source** under [`src/tubemap/`](../../src/tubemap),
> which arrived 2026-08-17 with its comments left as written for the same reason: they are
> the reasoning that produced the code, and rewriting prose to survive a move is how it stops
> being trustworthy. The one thing that *was* rewritten is this ADR's own number — the source
> said `0001`, meaning this decision, and `0001` here is a different one — so every `ADR 0001`
> in the migrated files now reads `0002`.
>
> - Every bare **`CONTEXT.md`** below is the **spike's** `CONTEXT.md` and its numbered
>   decisions — *not* PGB's `CONTEXT.md`, which is a glossary with no numbered decisions in
>   it. The spike's copy stays in that repo as the record of how this was arrived at.
> - Bare **`src/…`** paths are the spike's, and land under **`src/tubemap/`** in PGB.
>   Bare **`#NN`** are spike issues.
> - `notes/…` links point into the spike repo, which is where the measurements they name
>   live.

> **Measured 2026-08-14.** The decision below is confirmed by a working renderer rather
> than by argument: 40,442 bands in one instanced draw call, 8.3–8.4 ms per frame from
> fit to 200× zoom, worst frame 10.5 ms, on an M1 Pro through ANGLE Metal. Full result in
> [`notes/…/2026-08-14-three-js-renderer-verdict.md`](../../notes/sequence-tube-map/measurements/2026-08-14-three-js-renderer-verdict.md).
>
> **Several consequences below are wrong and are corrected in place**, each marked. In
> summary: the camera is driven by `MapControls`, not by an `{x, y, scale}` object; the
> segment boxes ~~will be geometry, not a DOM overlay~~ **are HTML divs, reversed again
> 2026-08-15**; the sub-pixel-ribbon framing is
> misleading because strands abut; and the prediction about MSAA is wrong in its mechanism.
> The *geometry* reasoning — the grammar, the smoothstep collapse, the lapped joins, six
> floats per band — holds exactly and is what made the renderer a day's work.
>
> **Half the price is withdrawn, 2026-08-16 (#40).** This decision was paid for with a
> validation gate *and the SVG surface as the gate's fallback*. The surface is deleted;
> only the gate remains. See *The fallback half is rejected* and *The surface is deleted*
> under the validation-gate consequence — a non-conforming document now ends in an error
> state and nothing draws it, which is a real reduction in safety and is recorded there as
> one rather than left to be inferred from a deletion.

Two independent failures on 2026-08-12/13 — style invalidation at ~28 ms per hover,
and unpainted bands from a 900-megapixel composited layer — proved that this data
cannot be drawn through the DOM at any element count we will actually receive. We
are replacing the SVG surface with a three.js renderer that **parses the server's
SVG into geometry and rasterizes it on the GPU**, rather than displaying it.

This reverses three decisions recorded in `CONTEXT.md`, which is why it is written
down here rather than left as a bullet.

## The trade being made

`CONTEXT.md` #1 held that **the SVG is opaque and immutable** — the server sends a
picture and the viewer displays it. That is the single most load-bearing property of
the old design and it is what we are giving up. The viewer now *interprets* drawing
primitives: it reads `d` attributes, recognises a specific path grammar, and rebuilds
the image from numbers it inferred. UCSD becomes an upstream we are coupled to at the
level of drawing commands. A change on their side that an SVG viewer would absorb
silently — a text label, a stroke, a gradient — becomes a rendering bug for us.

We accept this because the alternative is not "keep the pure viewer." The pure viewer
does not work on this data. The choice was between interpreting the geometry and
restructuring the DOM renderer to re-draw a viewport-sized window on every navigation,
which is comparable work and leaves the ~28 ms interaction wall standing.

> **Amended 2026-08-27 — the coupling is being retired at the source.** This section
> records the largest cost this ADR accepted, and it is the one that is going away. UCSD's
> `/seqtubemap` is gaining `?format=bands`, which publishes the geometry as numbers instead
> of hiding it in drawing commands for us to infer back out. Their
> `docs/adr/0001-additive-band-format.md` in that repo is the decision — under review as
> [PangenomeAPI#12](https://github.com/CAST-genomics/PangenomeAPI/pull/12) at the time of
> writing; the measurements that forced it are that **93.7%** of their render's
> memory is the jsdom document they build only to serialize, and **41–47%** of every
> response we receive carries no information — per-strand constants re-serialized on every
> band, `color=` duplicating the rgb already in `style=`, `class=` duplicating `trackID`,
> and 40,716 empty `<title>` elements in `5520+` alone.
>
> Three things follow, and none of them is urgent:
>
> - **The band data becomes canonical and the SVG becomes a rendering of it.** This ADR's
>   framing inverts: we stop inferring their geometry and start receiving it. Where the two
>   encodings disagree, the SVG is the wrong one.
> - **`parseBands.ts` and `parseSegmentBoxes.ts` do not change yet.** Their increment **B**
>   deletes jsdom server-side while holding the response byte-compatible with our existing
>   parser *as a deliberate constraint* — the contiguous `style` / `trackID` / `trackName`
>   run survives, and the `<rect>` + `<path>` count in `g.track` is unaffected by the
>   `color=`, `class=` and empty-`<title>` attributes they drop. So the ceiling rises with
>   **no change on our side**, and this viewer serves as their conformance test: a bad
>   deploy reaches us as an error card, which is exactly what the whole-document refusal was
>   built for.
> - **The parser changes at their increment C**, when the JSON-header-plus-binary-body
>   format lands. At that point the regex pass is deleted rather than shrunk — a
>   `Float32 × 6 + Uint16` body copies straight into the instance buffer with no parse at
>   all — and roughly 1.5 MB replaces 10.07 MB at the 10 kb region.
>
> What survives unchanged is everything under *What makes it tractable*: the grammar, the
> smoothstep collapse, the lapped joins, six floats per band. Those were never facts about
> SVG — they were facts about the layout, and the layout is what we will now be sent
> directly. The **fetch ceiling** (cost 4 below) is the same story from the other end: it is
> a DOM ceiling on their side, and their increment B is the fix for it.

## What makes it tractable

The price is bounded by a fact measured, not assumed: **127,101 of 127,101 strand paths
across 17 documents conform to one grammar, with zero exceptions.** (Originally
established on the fixture's 5,667 paths; confirmed 2026-08-13 across every node the
API would return — spans of 1 bp to 7,967 bp, 369 to 464 strands. Larger nodes are
untested because they cannot be fetched.)

```
M x0 y0  C cx y0  cx y1  x1 y1   V y1+15  C dx y1+15  dx y0+15  x0 y0+15  Z
```

Both control points of each cubic share an x, so `x(t)` is strictly monotone and each
edge is a true function of x. The y profile expands to `y0 + (y1-y0)·(3t² − 2t³)` —
literally `smoothstep`. Band thickness is **15** for every band in the map, and the
4,603 `<rect>` elements are the same primitive degenerate.

So a band is six floats, and the renderer needs no path parser and no tessellator.

**A band is a fragment, not a ribbon.** One haplotype is drawn as many pieces — a
median of 28 in the fixture, ~87 in `5520+` — alternating between segment-crossing
rectangles and inter-segment curves. That fragmentation is *why* the grammar is
uniform: the server has already decomposed every strand into elementary smoothstep
transitions, which is the reason there are no arbitrary beziers left to tessellate.
Two further consequences, both measured:

- **The pieces are lapped, not butted.** Every one of 9,883 joins overlaps by exactly
  **1.0 unit** with identical y on both sides. Abutting shapes under analytic coverage
  would seam; lapped ones do not, and since lapped pieces share a strand and therefore a
  colour, the double-blend is a no-op. The seam problem is solved upstream.
- **The instance count is irreducible.** Merging consecutive collinear pieces saves
  **0%** — a strand never has two horizontal pieces in a row at the same y, because the
  two kinds strictly alternate.

## Consequences

- **One instanced draw call.** A shared parametric "ladder" mesh, replicated per band
  via `InstancedBufferGeometry`. The vertex shader places rungs on the curve; the
  fragment shader computes exact vertical coverage against both edges. Chosen over
  bounding-box quads (measured 9.2× wasted fragments) and over plain MSAA
  tessellation, because at fit scale a band is ~~**0.6 CSS px** tall and MSAA's
  quantised coverage would alias 464 stacked sub-pixel ribbons into noise~~. Analytic
  coverage is what makes the SVG look right, so it is what we reproduce.

    **Corrected 2026-08-14, three ways.**

    1. **The band height is fixture-dependent, and "ribbons" is misleading.** 0.6 px is
       the 600 bp fixture; `5520+` gives **0.19 px** and `5514+` 0.12 px. More
       importantly, **strands abut with zero gap** — pitch 15 against thickness 15 — so
       the map is a solid field of colour, not thin ribbons on white. Nothing thin is
       drawn against a background; what must survive is the colour transition between
       touching neighbours.
    2. **MSAA does not alias into noise. It discards.** Each of four samples is won
       outright by one band, so no background survives and the result looks *more*
       saturated than analytic coverage — but at most four of the 2.6-to-5 bands
       covering a pixel can be represented, and the rest are lost: 101 distinct values
       per column against analytic's 119, out of 464 strands. The conclusion survives;
       the mechanism was wrong.
    3. **The choice barely matters.** At 40× zoom the two techniques differ by 6.18% of
       pixels at a mean channel delta of 2.32/255. The entire question lives below one
       pixel per band — the regime where 464 strands land on 177 device rows and nothing
       is legible regardless. Analytic is kept because it preserves ~10× more distinct
       colour at no cost, not because the difference is visible where anyone works.

    Also corrected: **no root-finding is required.** Both edges of a band reach `x0` at
    `t=0` and `x1` at `t=1` regardless of their control abscissae, so sampling both at
    even `t` inscribes a correct polygon with vertical ends. Rungs at even *x* — which
    is what forces an inversion of `x(t)` — were never necessary.
- ~~**A validation gate, and the SVG surface kept as its fallback.**~~ **A validation
  gate, and nothing behind it — 2026-08-16.** Anything in
  `g.track` that does not match the grammar rejects the **whole** document, loudly,
  and ~~falls back~~. Partial rendering is not offered: this API already returns
  200-with-plausible-nonsense for an unknown `minigraphnode`, and a half-drawn map is
  a silently wrong map. The 75 stroked, translucent segment boxes in `g.node` are a
  whitelisted exception — ~~they stay as DOM SVG in an overlay, which also keeps
  segment hit-testing free~~.

    **The fallback half is rejected, 2026-08-14 — the gate half stands.** The gate is
    built and rejects loudly; **nothing falls back, and nothing will.** A fallback
    means a second surface silently swapped in underneath the researcher, so what they
    are looking at depends on a validation result they never saw — and it means every
    later feature is owed twice, to a surface that exists only for a case nobody has
    met. A refusal is an error to be dealt with when it occurs, on the evidence of the
    document that caused it. That is cheaper than a permanent second implementation
    insuring against it, and it is the only arm that produces a bug report.

    This retires the last stated reason for the SVG surface's existence. ~~It survives
    for now as a comparison arm and as the only surface with per-element hit-testing —
    both temporary, neither a fallback.~~

    **The surface is deleted, 2026-08-16 (#40), and this is what the ADR now costs.**
    The trade at the top of this document was: give up the opaque, immutable SVG, and pay
    for it with a validation gate *and* the SVG surface standing behind the gate. Both
    halves of that payment are now withdrawn, and the second is a real reduction in safety
    that must be read here rather than inferred from a deletion.

    What we no longer have: if UCSD changes the drawing grammar, there is no surface that
    can display the new document. Every researcher looking at an affected node sees an
    error card until the parser is changed and shipped. Under the original decision they
    would have seen the map, drawn slowly and correctly, while we caught up. That is what
    is being given up, stated plainly, and nothing below softens it.

    **One rule leaves the gate, 2026-08-25 — see ADR
    [`0004`](0004-band-direction-and-inverted-routes.md).** The gate required every band to
    run left to right, and a document from chr8p23.1 containing an inversion was refused by
    it: 3771 of 5948 connectors run right-to-left, 297 of 463 haplotypes traverse the window
    the other way round, and GRCh38 is among them. Those bands satisfy every other rule —
    thickness, shared control abscissas, the offset return edge — so the refusal was not
    about the drawing grammar at all. **`x1 > x0` is withdrawn; every other assertion
    stands.** The policy is unchanged: a document off the grammar is still refused whole and
    partial rendering is still never offered. What this records is that direction was never
    grammar, and the cost above was paid once for a case that turned out to be biology.

    This is also the first time the gate produced the bug report it was designed to produce,
    which is the arm this ADR chose over a fallback surface.

    Three reasons it is still the right trade, in the order they carry weight:

    1. **A fallback nobody exercises is a fallback that does not work.** It was never
       reached automatically — that was settled 2026-08-14 above — so its only remaining
       mode was a researcher typing `?renderer=svg`, having correctly guessed both that
       the flag existed and that the error they were looking at was a grammar refusal.
       Nobody was going to do that, and nothing tested that it still could.
    2. **It carries both original failures.** The surface behind the gate was the surface
       whose ~28 ms hover restyle and 900-megapixel composited layer are the reason this
       ADR exists. On the documents that matter it does not render. Falling back to it is
       falling back to the failure, so it was never insurance against a grammar change on
       a large node — only on a small one.
    3. **The cost was ongoing and paid in features.** Every capability landed after
       2026-08-14 was owed to a second surface that existed for a case nobody has met:
       #35's refusal states, #37's segment boxes, #38's picking, #39's feeler. It was
       diverging in practice — `4×` against `200×`, feeler off against feeler on — so the
       two surfaces were already answering differently, which is the property a fallback
       cannot have.

    What actually stands behind the gate now is the refusal itself: a named, loud error
    state (#35) that says which document failed and why, on the evidence of the document
    that caused it. That produces a bug report, which is the arm that gets the grammar
    fixed. It does not produce a picture, and we accept that.

    Retired with it, because none of it had another reason to exist: the CSS-transform
    viewport, `viewportTransform.ts`'s pan/zoom arithmetic and its `{x, y, scale}` object
    (see the correction further down, where that reimplementation is this ADR's largest
    error), the `<title>`-stripping `DOMParser` loader, the SVG surface's
    `elementFromPoint` feeler and its rasterized navigator thumbnail. `Point`, `Size`,
    `Rect` and `clamp` are all that survive, in `src/geometry.ts`.

    ~~**Reversed 2026-08-14.** The segment boxes become three.js geometry, picked with a
    raycaster; **there is no DOM overlay.** "Free hit-testing" is the same reasoning
    that produced `CONTEXT.md` #6, whose premise has already collapsed, and an SVG layer
    CSS-transformed in lockstep with the camera is exactly the coupling this renderer
    exists to escape.~~ Not yet built — deferred out of the spike deliberately.

    **Reversed again 2026-08-15, and this is the settled answer: the segment boxes are
    HTML `<div>`s.** The 2026-08-14 reversal generalised from "the DOM cannot draw this"
    to "the DOM may draw none of this," and the two failures it rests on do not support
    the second sentence. Both name a mechanism, and both mechanisms are population-sized:
    style invalidation across **10,270** elements at ~28 ms a hover, and a **900-megapixel**
    composited layer tiling a display list of **10,345** drawing commands. There are **767**
    segment boxes in the largest document, they are `<g class="node">`'s only contents, and
    they are hovered one at a time.

    They are also, literally, round rects — `M 11 20 Q 11 11 20 11 L 67 11 …` is a
    rectangle with quadratic corners of radius 9, `fill-opacity: 0.4`, `stroke-width: 2px`.
    Drawn as a div that is `border-radius: 9px`, `background: rgba(255,255,255,.4)`,
    `border: 2px solid #000`, sized in world units under one wrapper carrying the camera's
    `transform`. Geometry would need a stroked translucent material, its own draw order, a
    raycaster, and a DOM tooltip anyway.

    **What survives of the rule**, stated as the mechanism rather than as the medium: *no
    DOM layer whose rasterization the browser must redo at the camera's scale over a
    display list the size of the band population.* The band population stays on the GPU
    permanently. A wrapper holding 767 rounded rects and no `will-change` is not that
    layer — but it is the same *class* of thing, so it is judged by looking at `5514+` at
    200× before it is believed, with per-frame screen-space layout held in reserve.

    **Looked at 2026-08-15, and believed.** Built in `src/segmentOverlay.ts`; `5514+` at
    the 200× clamp draws all 767 boxes with the wrapper's bounds near 280,000 × 10,000 css
    px, and it neither tears nor drops tiles — including mid-drag, where the boxes and the
    canvas move in lockstep because the wrapper's transform is written in the frame that
    renders the canvas. `scripts/verify_segment_boxes.mjs` runs the whole of #37's
    acceptance and leaves the screenshots behind. The reserve was not needed and is not
    built.

    Picking is no longer the argument in either direction. The boxes take real pointer
    events and own hover; `MapControls` and the pick listeners move to the common
    ancestor so pan, zoom and the strand feeler pass through them. See `CONTEXT.md` #13.
- **Appearance becomes a table, not a stylesheet.** Each instance carries its
  `trackID`; a `DataTexture` holds one texel of appearance per strand. Highlighting is
  a ~2 KB upload whose cost is independent of how many strands are lit — retiring the
  ~28 ms wall that `CONTEXT.md` #15 ran into, and reviving feeler mode.

    **Two texels per strand since 2026-08-20**, and so a ~4 KB upload. The table gained a
    second plane of per-strand *modifiers* to carry the feeler's **thickness floor**
    (pgb #112), the emphasis texel having no byte left in it. The claim this consequence
    was making is untouched: the cost is still one write per strand and nothing per band,
    and still independent of how many strands are lit.
- **The canvas is viewport-sized.** The 2026-08-13 rendering failure is not fixed but
  made structurally impossible: there is no oversized composited layer to tile.
- ~~**`viewportTransform.ts` survives untouched** and drives an `OrthographicCamera`. No
  `MapControls` object is constructed — `CONTEXT.md` #8 is about gesture feel, which
  the existing pointer handling already replicates and unit-tests.~~

    **Reversed 2026-08-14, and this was the largest error in this ADR.**
    `viewportTransform.ts` is a **hand-written reimplementation of
    `pgb/src/mapControlsFactory.js`** — `wheelZoomFactor`, `ZOOM_SPEED = 1.2`,
    `zoomAbout`, `clampToViewport` — written only because the SVG viewer had no
    three.js. Declining to construct a `MapControls` object *while three.js is in the
    dependency tree* is reimplementing the library beside itself.

    The renderer uses `MapControls` with PGB's configuration verbatim — `zoomToCursor`,
    `enableRotate = false`, `screenSpacePanning`, `zoomSpeed 1.2`, `panSpeed 1`. Zoom is
    `camera.zoom`, pan is `camera.position`, and **there is no `{x, y, scale}` object
    anywhere.** That is closer to `CONTEXT.md` #8's intent, not further: PGB's controls
    are the original and `viewportTransform` was the copy. Its unit tests do not
    transfer.

    A second correction rides along: `MAX_SCALE = 4` must **not** be inherited. It was
    calibrated on the 600 bp fixture and never resolves a haplotype on the documents
    that matter. The renderer clamps at 200×.
- **`CONTEXT.md` #5's rationale inverts.** "No three.js, zero dependency overlap with
  PGB's 3D stack" was a virtue; the overlap is now the point, and the version is
  pinned to PGB's `^0.176.0`.
- **This does not address transport.** The largest catalogued nodes cannot be fetched
  at all — see [`notes/…/2026-08-13-api-fetch-ceiling.md`](../../notes/sequence-tube-map/measurements/2026-08-13-api-fetch-ceiling.md).
  A compact geometry format from UCSD is the natural follow-on, and this decision is
  what makes that request specific enough to be worth making.
