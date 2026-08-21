/**
 * The viewer's stylesheet, carried as a string so that mounting it costs the host
 * nothing but a call — no CSS import, no build-step assumption, no chance of PGB's
 * styles and these drifting apart in the bundle.
 *
 * The map is the data: no chrome inside the viewing surface. Every affordance here
 * is layered over the picture rather than arranged around it.
 *
 * The interpolations are the PCLAI inset's pad and ring, imported rather than written twice.
 * The pad is where the coordinate frame ends and the breathing room begins, and the inset
 * sizes that frame; a stylesheet that disagreed about it would paint the ramp somewhere
 * other than where the dots are plotted, which is the one error this plot cannot survive.
 */

import { PLOT_PAD, RING_WIDTH } from './pclaiInset.ts'

export const SURFACE_STYLES = `
.stm-root {
    --stm-ink: rgb(232, 234, 238);
    --stm-ground: rgb(250, 250, 250);
    --stm-chrome: rgba(18, 20, 24, 0.82);

    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* The surface takes its gestures here rather than on the canvas, so the browser's own
       scroll and pinch have to be refused here too — on the canvas alone they would still
       fire for a touch that started on anything mounted over it. */
    touch-action: none;
    overscroll-behavior: none;
    /* And the browser's text selection, for the same reason and one level higher up.
       .stm-canvas refuses it too, but a drag anchors a *range*, and a range spans
       whatever lies between its ends — so a pan that crossed the segment
       tooltip left it highlighted in blue, and left it that way, even though the tooltip
       is pointer-events: none and was never the drag's target. The map is a picture and
       the readouts over it are labels on that picture; none of it is a document. */
    user-select: none;
    background: var(--stm-ground);
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    contain: layout paint;
}

/* The one exception: the error state names a URL and says what went wrong with it, which
   is the one thing here worth copying out. */
.stm-status {
    user-select: text;
}

/* The canvas is viewport-sized at every zoom level — the oversized composited layer that
   broke the SVG surface is structurally impossible here — so it is simply stretched over
   the root. It is the root that takes the pointer, so that anything layered over the canvas
   is not a hole in pan, zoom and the feeler; the cursor stays here because the canvas is
   exactly the region the map is drawn in. */
.stm-canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    overscroll-behavior: none;
    user-select: none;
    cursor: grab;
}

/* A pan in progress, and the one rule that says so.

   Written on the root and on everything the pointer can be over, rather than as \`:active\`
   on each: \`MapControls\` takes pointer capture on the root when a drag begins, and a
   captured pointer stops hit-testing for \`:hover\` and \`:active\` — the capture target takes
   them instead. \`.stm-canvas:active\` therefore stopped matching the instant the drag it
   was describing actually began, and the root, which had no cursor of its own, fell back to
   the arrow: pressing showed the grabbing hand and moving took it away.

   The root is listed first because it is the element the capture makes current; the others
   because \`cursor\` inherits, and a plain rule on a descendant outranks an inherited value.
   \`bandSurface.ts\` puts the class on, for the primary button only and never while
   feeling. */
.stm-root.is-panning,
.stm-root.is-panning .stm-canvas,
.stm-root.is-panning .stm-segment {
    cursor: grabbing;
}

/* Feeler mode: the cursor is a feeler, not a grip — so it is a pointing finger.

   All three states are one hand in three poses: open to take hold, closed while holding,
   and a finger out while feeling. The crosshair this replaced (2026-08-16) was an
   instrument reticle in a set of hands, and it promised two-axis precision the interaction
   does not have — a feeler is swept, and only its vertical position selects anything.

   \`pointer\` conventionally means clickable, and nothing here is. That is a real cost and
   it is accepted: the finger matches what the mode *is* — CONTEXT.md #14 calls the cursor a
   feeler, making near-identical ribbons palpable — and while the key is held there is
   nothing to click anywhere, since the controls are off. Worth revisiting when clicking a
   segment becomes real, which is a different mode with no key held.

   There is nothing to make inert here — the canvas is one element and the pick pass answers
   with a strand id, so the dead zones the SVG surface had to rule out cannot arise. */
.stm-root.is-feeling .stm-canvas,
.stm-root.is-feeling .stm-segment {
    cursor: pointer;
}

/* The segment boxes (#37). One wrapper carrying the camera's transform; the boxes inside it
   are positioned in world units and never touched by a pan or a zoom.

   **No \`will-change\`.** That property is what promoted the SVG surface's transformed
   wrapper to the composited layer that came apart on 2026-08-13 — that surface, and the
   \`.stm-content\` it transformed, were deleted by #40 — and this wrapper's bounds top out
   near 280,000 × 10,000 css px. It holds at most 767 rounded rects rather than a display
   list the size of the band population, which is why it is a different thing — but it is
   the same class of thing, so it is judged by looking rather than by argument.

   Inert itself, since it spans the whole map: only the boxes inside it take the cursor. */
.stm-segments {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;
}

/* Reproducing \`fill: rgb(255,255,255); fill-opacity: 0.4; stroke: rgb(0,0,0);
   stroke-width: 2px\` and quadratic corners of radius 9, which is all a segment box is.
   Width, height, position, border width and radius are all written per box from the
   document's own numbers — nothing about the size is decided here.

   Nothing is pinned to a css size: the border scales with the camera like the 15-unit bands
   do. See *What the renderer corrects, and what it leaves alone* in notes/sequence-tube-map/rendering.md. */
.stm-segment {
    position: absolute;
    box-sizing: border-box;
    border-style: solid;
    border-color: rgb(0, 0, 0);
    background: rgba(255, 255, 255, 0.4);
    pointer-events: auto;
    /* The same grip the canvas underneath offers, because a drag starting on a box really
       does pan the map. Never \`pointer\`: nothing here is clickable yet. */
    cursor: grab;
}

.stm-segment:hover {
    background: rgba(255, 255, 255, 0.6);
}

/* Below the threshold in segmentOverlay.ts, and while no document is mounted. Stated rather
   than left to the UA sheet, because \`position: absolute\` is one cascade accident away from
   outranking it. */
.stm-segment[hidden] {
    display: none;
}

.stm-mode-badge {
    position: absolute;
    right: 12px;
    bottom: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--stm-chrome);
    color: var(--stm-ink);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 10px;
    opacity: 0;
    transition: opacity 120ms ease-out;
    pointer-events: none;
}

.stm-root.is-feeling .stm-mode-badge {
    opacity: 1;
}

/* ── PGB's node tooltip, borrowed outright ────────────────────────────────────────────────

   Copied 2026-08-15 from pgb/src/styles/_toolTipContainer.scss and _lookToolTip.scss — the
   styling behind Look.createNodeTooltipContent(). Kept under the same class names so the two
   codebases stay greppable for each other and a later divergence is a deliberate edit rather
   than a drift nobody noticed. \`$licorice\` and \`$magnesium\` resolve to #000000 and #B8B8B8;
   the scss nesting is written out flat, and nothing else is changed.

   A researcher crosses between the two viewers constantly, and a segment should not look
   like a different kind of object depending on which panel it is in. */
.graph-tooltip {
    position: absolute;
    background: rgba(255, 255, 255, 0.85);
    color: #000000;
    border-radius: 4px;
    pointer-events: none;
    z-index: 1000;
    display: none;
    white-space: nowrap;
    border: 1px solid #B8B8B8;
}

.look-tooltip {
    padding: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.4;
    color: #495057;
    width: fit-content;
    max-width: 300px;
}

.look-tooltip .node-section {
    margin-bottom: 1rem;
}

.look-tooltip .node-section:last-child {
    margin-bottom: 0;
}

.look-tooltip .node-section .node-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.9rem;
    color: #212529;
    padding-bottom: 0.125rem;
    font-weight: 600;
}

.look-tooltip .node-section .node-details-table {
    min-width: fit-content;
    border-collapse: collapse;
    margin: 0;
}

.look-tooltip .node-detail-label {
    padding: 0.125rem 0.5rem 0.125rem 0;
    font-size: 0.8rem;
    color: #212529;
    font-weight: 500;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
}

.look-tooltip .node-detail-value {
    padding: 0.125rem 0.5rem 0.125rem 0;
    font-size: 0.8rem;
    color: #6c757d;
    text-align: left;
    vertical-align: top;
}

/* ── and what this codebase adds to it ────────────────────────────────────────────────────

   PGB positions the container itself; here it is anchored to the surface's top-left corner
   and moved with a \`transform\`, which does not invalidate layout — so a tooltip following
   the cursor cannot turn the surface's own per-move \`getBoundingClientRect\` into a forced
   reflow. \`.graph-tooltip\` ships \`display: none\`, so being shown is a class.

   PGB's \`z-index: 1000\` is overridden down to 3: it outranks the navigator, which the
   tooltip may legitimately overlap, and yields to the status layer at 4, which must be able
   to cover a refused document with nothing showing through it. The rest of the copied block
   is left exactly as it stands there.

   The font is overridden because \`.stm-root\` sets a monospace \`font\` shorthand for the
   readouts, and PGB's tooltip is not monospace. */

/* The \`#\`s, given a little room on either side.

   A haplotype name is several fields run together and the separator is what tells a reader
   where one ends — set solid, \`NA21309#2#CM092097.1\` reads as one long token. The air is
   margin rather than an inserted space: the element's text stays the document's own
   spelling exactly, so nothing on screen is a character a researcher would then type.

   \`strandLabel.ts\` wraps them; it counts nothing and assumes nothing about how many there
   are, which is what keeps the four-part names working. */
.stm-strand-hash {
    margin: 0 0.09em;
}

.graph-tooltip,
.stm-strand-label {
    top: 0;
    left: 0;
    z-index: 3;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.graph-tooltip.is-shown,
.stm-strand-label.is-shown {
    display: block;
}

/* The name of the strand under the feeler (#111).

   **The same card as the tooltip above it**, and that is a design constraint rather than a
   convenience: a researcher crosses between the 3D graph, the segment tooltip and this
   label constantly, and a readout that changed medium — dark pill here, light card there —
   would read as a different *kind* of object rather than as one more thing the viewer is
   telling them. So it takes PGB's ground, border, radius and sans-serif face, and its own
   type is \`.node-title\`'s: each row is one identifier, which is exactly what a title row is.

   It is still its own element and not \`.graph-tooltip\` — sharing an appearance is not the
   same as sharing an owner, and #111 keeps the two separate (see \`strandLabel.ts\`). What
   is shared is stated once, here, in the selector lists above.

   Not monospace, though the name is an identifier: \`.stm-root\`'s monospace shorthand is
   for the numeric readouts, and PGB's tooltips — where a researcher reads node ids of the
   same shape — are set in the UI face. Matching them wins over matching the readouts.

   Anchored and moved exactly as the tooltip is, and inert for the same reason the badge is:
   the map underneath keeps answering the cursor, so the label is never the thing the pointer
   is over instead of the strand it names.

   The \`display: none\` below sits after \`.is-shown\` in source order and loses to it on
   specificity, which is how being shown stays a class here exactly as it is for the
   tooltip. */
.stm-strand-label {
    position: absolute;
    padding: 0.375rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #B8B8B8;
    background: rgba(255, 255, 255, 0.85);
    color: #212529;
    font-size: 0.9rem;
    line-height: 1.4;
    font-weight: 600;
    /* The one place this departs from the tooltip's type, and only just: a haplotype name
       is read character by character and copied out by eye, where a tooltip's prose rows
       are read as words. A little air between the glyphs keeps the string legible without
       loosening it into a row of loose letters. */
    letter-spacing: 0.02em;
    white-space: nowrap;
    pointer-events: none;
    display: none;
}

/* One haplotype name, one row (#120).

   The label names every strand inside the cursor's css pixel — six at fit — and the
   map lights exactly one of them, the one nearest the cursor. \`.is-emphasized\` is that one,
   and the receded rows say the same thing about the same strands that the map is saying
   underneath: a name at full strength refers to the strand currently emphasized, and a faded
   one is a neighbour the researcher would have to move to reach.

   0.55 rather than the map's 0.08: text has to stay readable to be worth drawing at all,
   where a receded band only has to stay present. The two are the same statement, not the same
   number. */
.stm-strand-name {
    opacity: 0.55;
    font-weight: 400;
}

.stm-strand-name.is-emphasized {
    opacity: 1;
    font-weight: 600;
}

/* The colour a name has everywhere else in the viewer, beside the name (#120).

   The point is one gesture answering in two panels at once: the dot beside a name here is the
   dot that haplotype has in the ancestry cloud — same colour, same shape — so finding a named
   strand in the cloud is matching one mark against another rather than remembering a position.

   **The colour is on a filled shape and not on the text**, and that is measured rather than
   preferred. The strand palette is pastel throughout: against this card's white the best of
   the 464 colours on \`5520+\` reaches 2.74:1 and the median is 1.88:1, so not one of them
   clears even the 3:1 that large text asks for, and the unplaced grey lands at 1.5:1. Names
   set in their own colour would be a label nobody could read. A swatch spends the colour where
   contrast is not the question and leaves the name at the card's near-black.

   The lit row's swatch takes the cloud's own ring — same grey, same hairline — so the two
   panels mark the answer identically. It is 1 px rather than the cloud's 1.5: the ring is
   drawn around a 9 px swatch here against a 20 px dot there, and at full weight it closed up
   the little colour it is meant to be a ring around. */
.stm-strand-swatch {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 0.45em;
    border-radius: 50%;
    /* The name is what a researcher reads along; the swatch sits on that line rather than on
       the baseline, where a round mark reads as a dropped character. */
    vertical-align: baseline;
}

.stm-strand-name.is-emphasized .stm-strand-swatch {
    box-shadow: 0 0 0 1px rgba(90, 94, 102, 0.95);
}

/* What the cap left out, above the list and below it (#120).

   Two counts rather than one total, because direction is the only part of this a researcher
   can act on — it is which way to move the cursor. Set smaller and lighter than a name and in
   the numeric face: this is the viewer talking about the list, not another entry in it. */
.stm-strand-count {
    opacity: 0.45;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    font-weight: 400;
    letter-spacing: 0;
}

/* Instrumentation, not chrome: only ?pick puts this on the surface.

   Bottom right, stacked directly above the mode badge, and the rule is the corner rather
   than the pixels: **a diagnostic readout sits out of the way of what the app draws.** It
   was top left, which was the one corner nothing claimed at the time — the harness's URL
   picker fills the top right at a higher z-index and hid it completely, and the navigator
   owns the bottom left. The PCLAI inset claims the top left now, and a readout over the
   cloud is exactly what this rule forbids.

   The offset clears the badge: 12 px of margin, the badge's own height, and 10 px between
   them. The badge is the only other thing in this corner and it is fixed-height, so the
   two stack rather than overlap whether or not the feeler is out. Anything added here next
   goes above this one, not beside it. */
.stm-pick {
    position: absolute;
    right: 12px;
    bottom: 44px;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--stm-chrome);
    color: var(--stm-ink);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    z-index: 3;
}

/* The PCLAI inset: the document's ancestry cloud, over the ramp that calibrates it.

   Top left, and moved from there by dragging its header. \`transform\` rather than
   \`left\`/\`top\` for the same reason the tooltips use one — it does not invalidate layout,
   so a drag cannot turn the surface's own per-move \`getBoundingClientRect\` into a forced
   reflow. The navigator owns the bottom left and the two do not meet at rest: it is anchored
   to the bottom edge and capped at 28.9% of the host's height.

   **Transparent to the pointer, except where it is not.** The widget and the plot are
   \`pointer-events: none\`, so a drag that starts on the cloud pans the map and a wheel over
   it zooms the map — a passive readout must never eat a gesture aimed at the picture it
   reports on. The header, the grip and the restore chip take their own events and call
   \`shieldFromMap\`, which is what stops the map answering them as well.

   z-index 2, with the navigator: under the tooltips and the strand label at 3, which may
   legitimately cross it, and under the status layer at 4, which has to be able to cover a
   refused document with nothing showing through. */
.stm-pclai-inset {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(70, 74, 82, 0.55);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    pointer-events: none;
    z-index: 2;
}

.stm-pclai-inset[hidden],
.stm-pclai-restore[hidden] {
    display: none;
}

/* The drag handle, and the only row in this widget that is not the plot. Small and quiet:
   it is a grip and a label, and the cloud is the thing being looked at. */
.stm-pclai-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 22px;
    padding: 0 8px;
    color: rgb(70, 74, 82);
    cursor: grab;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
}

.stm-pclai-inset.is-dragging .stm-pclai-header {
    cursor: grabbing;
}

.stm-pclai-title {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.stm-pclai-dismiss,
.stm-pclai-restore {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    cursor: pointer;
}

.stm-pclai-dismiss {
    padding: 0 2px;
    font-size: 14px;
    line-height: 1;
}

/* What is left of the widget once it has been dismissed: enough to bring it back, and no
   more. It sits where the widget sat, so the thing that returns appears where it went. */
.stm-pclai-restore {
    position: absolute;
    left: 0;
    top: 0;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--stm-chrome);
    color: var(--stm-ink);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: auto;
    z-index: 2;
}

/* The plot: the ramp, and the dots over it.

   The ramp is a **legend**, and where it is stretched to is written from \`pclaiInset.ts\`
   rather than declared here: it covers exactly the box \`strandCoordinates.ts\` maps the
   ramp's domain onto, so a dot's own colour is the colour beneath it. It is a translucent
   PNG, so it is composited over white here exactly as PGB's own PCLAI chart composites it —
   the two scatters read as one legend or they read as two different claims about ancestry.

   It runs to the widget's border on the left, right and bottom, with no margin between: a
   white surround read as a frame around the picture rather than as part of it.

   **The breathing room is inside the coordinate frame instead**, as a transparent border of
   \`PLOT_PAD\`. That border is what the element's content box is inset by, so the content box
   *is* the domain — which is why \`background-origin\` and \`background-clip\` are
   \`content-box\`: the ramp is painted on exactly the box \`strandCoordinates.ts\` maps the
   domain onto, at any size, and a dot still sits on its own colour. Dots are positioned
   against the padding box, which with no padding is the same box, so nothing offsets them.

   \`border-image\` fills the margin with the ramp's own outermost pixels, stretched outward:
   a 1 px slice on each side, with no \`fill\`, so the interior is left to the background above
   and only the four bands and corners are drawn. The result is a picture with no seam and no
   frame, where the outer band is a **clamp rather than a legend** — it continues the edge
   colour outward, and no document in this repo places a haplotype outside the domain for it
   to mislabel. What it buys is that a haplotype at the very edge of the cloud is drawn whole,
   ringed whole, and clear of the resize grip. */
.stm-pclai-plot {
    position: relative;
    /* Stated, and load-bearing. \`resizePlot\` writes the *content* box — the coordinate
       frame the domain is mapped onto — and the pad is a border outside it. PGB's
       \`index.html\` loads Bootstrap, whose reset makes every element \`border-box\`, and under
       that the pad eats inward instead: the frame shrinks to \`size - 2 * PLOT_PAD\` while
       \`plotCloud\` still projects over \`size\`, so the cloud overhangs the bottom-right by a
       whole pad and \`overflow: hidden\` shaves it. That is the bug #123 shipped with, and it
       was invisible from \`dev/tubemap.html\`, which loads no Bootstrap. \`dev/tubemap-app.html\`
       is the page that does, and \`scripts/verify_pclai_pad.mjs\` measures this there. */
    box-sizing: content-box;
    border: ${PLOT_PAD}px solid transparent;
    /* Two layers, and the second is why. The ramp is a translucent PNG, so what it is
       composited over decides its colour: painted on the content box alone, the interior sat
       on pure white while the clamped band sat on the widget's 92% white, and the pad's inner
       edge showed as a seam all the way round. The white underlay is clipped to the border
       box instead, so both halves of the picture stand on the same ground. */
    background-image: url('/images/pca-chart-background.png'), linear-gradient(#ffffff, #ffffff);
    background-repeat: no-repeat, no-repeat;
    background-size: 100% 100%, 100% 100%;
    background-origin: content-box, border-box;
    background-clip: content-box, border-box;
    border-image-source: url('/images/pca-chart-background.png');
    border-image-slice: 1;
    pointer-events: none;
}

/* One haplotype. Positioned when the document is plotted and again when the grip resizes
   the plot — the dots reproject rather than the plot scaling as a bitmap. It does not pan,
   zoom or follow the camera.

   The transition is on the two properties the ring changes and is short enough to read as
   the dot growing rather than as an animation to wait for. Position is not transitioned:
   the ring must be *on* the haplotype under the cursor, never sliding towards it. */
.stm-pclai-dot {
    position: absolute;
    border-radius: 50%;
    transition: opacity 90ms ease-out, box-shadow 90ms ease-out;
}

/* The feeler is out: the crowd recedes, exactly as the strands in the map do, so one gesture
   has one idiom in both panels.

   Not the map's own 8%, and the difference is the substrate. A receded band is drawn over
   white and 8% is what left the bundle's envelope legible; a receded dot sits on a saturated
   colour ramp, where 8% is gone entirely and the cloud stops being context for the ring.
   Chosen by looking at both fixtures.

   **Greyed as well as faded**, and the fade alone is what was wrong with it. A dot sits on the
   ramp's own rendering of its coordinate — that is the whole design, so the legend reads — so
   a *coloured* dot faded to 28% over the colour it already matches subtracts almost nothing.
   In the dense arms the crowd stayed a saturated mass and the marked dots had to be hunted for
   inside it. Draining the colour is what actually clears the ground: the arm goes grey, the
   ramp behind it keeps its hue, and the two or three dots still in colour are the only
   coloured things left in that part of the plot.

   **Grey does not collide with anything here**, which is what makes this available in the
   cloud and not in the map. \`strandAppearance.ts\` chose translucency over desaturation for the
   bands precisely because grey already means \`pclaiX="None"\` there. In this plot an unplaced
   haplotype is never drawn at all — see \`plotCloud\` — so there is no grey dot for a
   desaturated one to be confused with. The same reasoning the ring below is built on.

   One class on the plot drives all 464 dots; nothing per-element is written when the feeler
   moves, which is what keeps a sweep to the handful of dots that actually change tier. */
.stm-pclai-plot.is-feeling .stm-pclai-dot {
    opacity: 0.28;
    filter: grayscale(1);
}

/* The rest of the pick set (#120): every other haplotype inside the cursor's css pixel.

   At fit six strands share that pixel and the map cannot separate them. The label names all
   six; this is the cloud saying the same thing, so the two readouts cannot be read as two
   different counts of what is under the cursor.

   **Drawn exactly as the ringed dot is drawn, minus the ring** — same \`MARKED_SIZE\`, same
   full colour. The set is one answer and looks like one. Size does not also encode which of
   them is lit, because the ring already does; two marks for one distinction only makes the
   reader compare diameters to find out what a hairline already says.

   Sits above the crowd and below the ring, so a mark can never be hidden by the crowd and the
   ring is never hidden by a mark. */
.stm-pclai-plot.is-feeling .stm-pclai-dot.is-in-set {
    opacity: 1;
    filter: none;
    z-index: 1;
}

/* The one haplotype under the feeler. The ring is the mark and the growth is what makes it
   findable at a glance; neither would do on its own, because a bigger dot inside a cluster
   is still the same hue as the cluster.

   **Grey, and thin.** It was 2 px of near-black, which read as a heavy object sitting on the
   cloud rather than as a mark on one dot of it — the crowd around it is receded and pastel,
   so the ring never needed that much weight to win. A hairline of mid grey is still
   unmistakable against every part of the ramp, checked in the dense pink arm where a ring
   has the least contrast to work with.

   It is deliberately **not in the ancestry palette**, which is pastel hues throughout, so a
   ring can never be mistaken for a haplotype. Grey does carry a meaning in this data — the
   document fills unplaced strands with a light \`rgb(211, 211, 211)\` — but nothing that
   collides here: this is a dark stroke rather than a pale fill, and an unplaced haplotype is
   never drawn in this plot at all. */
.stm-pclai-plot.is-feeling .stm-pclai-dot.is-ringed {
    opacity: 1;
    box-shadow: 0 0 0 ${RING_WIDTH}px rgba(90, 94, 102, 0.95);
    filter: none;
    z-index: 2;
}

/* The resize grip: two rules of the corner it is in, drawn as a diagonal. It takes its own
   pointer events, like the header, and nothing else in the widget does. */
.stm-pclai-grip {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    pointer-events: auto;
    touch-action: none;
    background:
        linear-gradient(315deg, transparent 0 3px, rgba(20, 22, 26, 0.35) 3px 4px, transparent 4px 6px,
            rgba(20, 22, 26, 0.35) 6px 7px, transparent 7px);
}

.stm-navigator {
    position: absolute;
    left: 16px;
    bottom: 16px;
    overflow: hidden;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.14);
    cursor: pointer;
    touch-action: none;
    z-index: 2;
}

.stm-navigator[hidden] {
    display: none;
}

.stm-navigator.is-dragging {
    cursor: grabbing;
}

/* Baked at the size the widget had when the map loaded, and scaled from there: a resize
   re-fits the navigator without re-rendering the map into it. */
.stm-navigator-thumbnail {
    display: block;
    width: 100%;
    height: 100%;
}

/* Hit-tested, unlike most things drawn over something else. It was pointer-events: none,
   which made the rect a window through the navigator onto the map behind it: the element
   under the cursor there was the canvas, so the surface picked the strand the navigator
   covers while the researcher was looking at the navigator. The drag is on the widget and
   the press bubbles to it either way, so taking events costs the gesture nothing. */
.stm-navigator-rect {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(20, 22, 26, 0.9);
    background: rgba(40, 120, 255, 0.16);
    box-shadow: 0 0 0 9999px rgba(255, 255, 255, 0.45);
}

.stm-status {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    color: rgb(70, 74, 82);
    background: var(--stm-ground);
    z-index: 4;
}

.stm-status[hidden] {
    display: none;
}

/* Drawn as a card with a mark on it, not as red text on the ground.
   Every failure here — unreachable, absent, undrawable, viewer fault — arrives looking
   exactly like a tube map with nothing in it, and the gate is only worth having if a
   refusal cannot be taken for one (loadFailure.ts). So the error state is given an
   edge, a fill that is not the map's ground, and a mark, and reads as something placed
   over the surface rather than as the surface itself. */
.stm-status.is-error {
    --stm-alarm: rgb(168, 44, 44);

    color: rgb(58, 62, 70);
    background: rgba(244, 244, 246, 0.94);
}

.stm-status-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 22px 28px 20px;
    border: 1px solid rgba(168, 44, 44, 0.35);
    border-radius: 6px;
    background: rgb(255, 255, 255);
    box-shadow: 0 1px 3px rgba(20, 22, 26, 0.10);
}

.stm-status-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--stm-alarm);
    color: var(--stm-alarm);
    font-weight: 700;
    font-size: 15px;
    line-height: 1;
}

.stm-status-heading {
    font-weight: 600;
}

/* Only when it is an error. The loading state shares the element and keeps the status's
   own colour — a spinner over an alarm-coloured line would announce a problem there
   isn't one yet. */
.stm-status.is-error .stm-status-heading {
    color: var(--stm-alarm);
}

/* Capped so a parser's reason — which names coordinates and counts — wraps into a
   readable measure rather than running the width of a strip-shaped surface. */
.stm-status-reason,
.stm-status-note,
.stm-status-url {
    max-width: 56ch;
    overflow-wrap: anywhere;
}

/* Set apart from the reason above it, because it says something different in kind: the
   reason is what happened, the note is where the fault lies. Same size, so it is not
   mistaken for fine print — it is the part that stops a researcher debugging their own
   network for twenty minutes. */
.stm-status-note {
    color: rgb(96, 100, 108);
    border-left: 2px solid rgb(210, 213, 219);
    padding-left: 10px;
    line-height: 1.45;
}

/* Quietest of the four: it is here to be copied into a bug report, not read first. */
.stm-status-url {
    color: rgb(120, 124, 132);
}

.stm-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.14);
    border-top-color: rgba(0, 0, 0, 0.55);
    animation: stm-spin 700ms linear infinite;
}

.stm-status.is-error .stm-spinner {
    display: none;
}

@keyframes stm-spin {
    to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
    .stm-mode-badge { transition: none; }
    .stm-spinner { animation-duration: 2s; }
}
`
