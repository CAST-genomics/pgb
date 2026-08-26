/**
 * The surface: a three.js scene holding every band of one document, driven by
 * `MapControls`.
 *
 * The only one, since #40 (2026-08-16) retired the SVG surface this was built beside.
 * Where the notes below say what the SVG surface did differently they are history, not a
 * live comparison — kept because each names a wall this design exists to be on the far
 * side of.
 *
 * Rewritten from `spike/bandSurface.ts` after the verdict in
 * `notes/sequence-tube-map/measurements/2026-08-14-three-js-renderer-verdict.md`. Two things changed in the rewrite and
 * nothing else did:
 *
 * - **Only analytic coverage is built.** The spike carried both arms on a live toggle so
 *   they could be judged against each other on the same frame; that comparison is over
 *   and technique C won, so the `#ifdef` ladder, the second WebGL context and the camera
 *   hand-off between them are all gone. `notes/sequence-tube-map/rendering.md` keeps the comparison.
 * - **The camera is framed in pixels**, not in the content's own width — see
 *   `bandCamera.ts` for why, which is entirely about what a resize should do.
 *
 * ## What this is not
 *
 * There is no `{x, y, scale}` object, no fit-to-width transform, no hand-written wheel
 * handling and no CSS transform. Zoom is `camera.zoom`, pan is `camera.position`, and
 * gestures come from `MapControls` configured exactly as PGB configures it. The SVG
 * surface reimplemented that library by hand because it had no three.js; that copy went
 * with it.
 *
 * ## Where the pointer is taken
 *
 * On the **root**, not the canvas — controls and pick alike. A sibling element over the
 * canvas does not bubble to the canvas, so anything mounted above it would be a hole in
 * pan, zoom and the feeler; bound to the common ancestor, events bubble up through the
 * overlay and the map keeps working underneath it. The root is larger than the canvas and
 * hosts chrome of its own, so `surfacePointer.ts` decides per event which of those an event
 * is over, and the canvas coordinates come from the canvas's bounds rather than from
 * whatever the event happened to land on.
 *
 * ## The ladder
 *
 * There is one mesh in the scene: a strip of `RUNGS` quads spanning the band's parameter
 * from 0 to 1, two rows deep. It carries no positions — only, per vertex, a curve
 * parameter `t` and a flag saying which edge it belongs to. The vertex shader places
 * every rung from six per-instance floats, so zooming touches no geometry at all.
 *
 * Both edges of a band are cubics whose control points share an abscissa. Normalised by
 * the span, with `u` the control abscissa as a fraction:
 *
 *     x(t) = 3u·t·(1-t) + t³        y(t) = y0 + (y1-y0)·(3t² - 2t³)
 *
 * The y expansion is literally `smoothstep`, because the cubic's control ordinates are
 * copies of its endpoints. And `x(0) = 0`, `x(1) = 1` **for every u** — so the two edges
 * meet at both ends however much their control abscissae differ, and sampling both at the
 * same `t` yields a closed polygon inscribed in the true band with vertical ends.
 *
 * That is why there is no root-finding in the geometry. Placing rungs at even *x* would
 * require inverting `x(t)` per vertex, because the two edges have different `u` and so do
 * not share an x at equal t; placing them at even *t* removes the question. The cost is
 * that rungs are spaced unevenly in x — by no more than ~3× — which affects nothing,
 * since tessellation error follows curvature rather than spacing.
 *
 * `RUNGS = 64` leaves a worst-case chord error of 0.41 px in x and 0.06 px in y, measured
 * at 200× zoom on the widest piece in `5520+`, and a sweep of 16/32/64/128 showed flat
 * frame time — rung count is free in this range. The spike swept it from the URL; the
 * sweep is over, so it is a constant here rather than a parameter nobody passes.
 *
 * ## Feeler mode
 *
 * Holding `Shift` turns the cursor into a feeler: the strand it touches is drawn in full and
 * at no less than a floor of screen-space thickness (#112), everything else recedes, and
 * releasing brings the whole map back. The emphasis *follows*
 * the cursor rather than accumulating — that reversal is the user's, and `strandAppearance.ts`
 * carries the reasoning. Hover alone does nothing, and the controls are switched off for the
 * duration — `Shift` arbitrates pointer ownership (`CONTEXT.md` #13, #14).
 *
 * The same interaction was built on the SVG surface and shipped switched off, because
 * invoking it invalidated style across ~10,000 elements at ~28 ms a swap. Here the
 * appearance of every strand is two texels in a 4 KB table (`strandAppearance.ts`), so a touch
 * writes two bytes and the frame that follows uploads the table. Nothing per band, nothing
 * per lit strand — which is what makes lighting one strand and lighting two hundred cost the
 * same, and why this ships on rather than behind a flag. Measured in
 * `scripts/verify_highlight.mjs`. It is the only feeler now, and the flag that switched
 * the other one on went with #40.
 *
 * ## The segment boxes are not in the scene
 *
 * `g.node`'s 767 rounded rectangles are HTML divs over the canvas, in `segmentOverlay.ts`.
 * They are the one thing this surface draws that the GPU does not, and the reasoning is in
 * that file. What matters here is only the wiring: they are parsed alongside the bands and
 * can refuse the same document, they are mounted and emptied in the same calls the scene is,
 * and they are placed from the camera in the same `requestAnimationFrame` that renders it.
 *
 * ## The PCLAI inset is not in the scene either
 *
 * `pclaiInset.ts` plots one dot per placed strand over the ancestry ramp, as divs, and the
 * wiring is the same as the boxes': built from the parsed document in `show`, emptied in
 * `clear`, destroyed with the surface. It is not placed from the camera — the cloud is a
 * position report in coordinate space and has nothing to do with where the view is.
 *
 * The feeler drives it through `touch`, on the same transition that writes the appearance
 * table and names the strand: one question, one answer, three places it shows up. Listeners
 * outside the surface get the same transition through `onFocusStrand`.
 *
 * ## Drawing happens on demand
 *
 * The spike ran an unconditional animation loop because it was also reading a frame
 * meter. `MapControls` runs without damping, so it calls `update()` from its own pointer
 * and wheel handlers and announces every camera change; a frame is scheduled from that
 * and from nothing else. A mounted surface nobody is touching costs no frames at all,
 * which matters once this is one panel inside PGB rather than the whole page.
 */

import {
    BufferAttribute,
    GLSL3,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    LinearSRGBColorSpace,
    Mesh,
    NoBlending,
    OrthographicCamera,
    RawShaderMaterial,
    Scene,
    WebGLRenderer,
    WebGLRenderTarget
} from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import {
    devicePixel,
    fitZoom,
    pixelFrustum,
    usable,
    visibleContentRect,
    worldFromContentPoint,
    zoomRange,
    type Viewport
} from './bandCamera.ts'
import { createBandPicker, PICK_SAMPLES, type BandPicker, type StrandColumn } from './bandPicker.ts'
import { watchFeelerKey, type FeelerKey } from './feelerKey.ts'
import type { Point, Size } from './geometry.ts'
import { readInversion, type HaplotypeReading } from './inversion.ts'
import { createInversionNote, type InversionNote } from './inversionNote.ts'
import { createNavigator, type NavigatorHandle } from './navigator.ts'
import { THICKNESS, parseBands, strandCss, type ParsedMap } from './parseBands.ts'
import { parseSegmentBoxes } from './parseSegmentBoxes.ts'
import { createPclaiInset, type PclaiInset } from './pclaiInset.ts'
import { createSegmentOverlay, type SegmentOverlay } from './segmentOverlay.ts'
import { canvasPoint, overChrome } from './surfacePointer.ts'
import {
    APPEARANCE_ROW,
    FLOOR_STEPS_PER_PX,
    createStrandAppearance,
    type StrandAppearance
} from './strandAppearance.ts'
import { createStrandLabel, type StrandLabel } from './strandLabel.ts'

/** Quads per band along its span. See the note on tessellation error above. */
export const RUNGS = 64

/** What the feeler is handed over empty space, and on the key alone before the first pick.
 *  A real state rather than the absence of one: a sweep crosses gaps between bands
 *  constantly, and springing back to full colour in each of them would strobe. */
const NOTHING: StrandColumn = { strandIds: [], nearest: -1 }

const VERTEX = /* glsl */`
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uThickness;
uniform float uPad;

// Two texels per strand, a plane apart: RGB and emphasis, then the strand's modifiers, of
// which red is the thickness floor. See strandAppearance.ts — this is why highlighting costs
// the same however many strands are lit.
uniform sampler2D uAppearance;
uniform float uAppearanceRow;
uniform float uAppearancePlane;

// One css pixel in world units, which is what the floor is quoted in, and the steps-per-pixel
// the table encodes it with. The pick pass sets the pixel to zero: see PICK_FRAGMENT.
uniform float uFloorPixel;
uniform float uFloorSteps;

in vec2 aParam;     // x: curve parameter 0..1, y: 0 = upper edge, 1 = lower edge
in vec4 iSpan;      // x0, y0, width, y1  — y0/y1 are the upper edge, world space
in vec2 iControl;   // control abscissa of the upper and lower edge, as a fraction
in float iStrandId; // the haplotype this band belongs to: its appearance, and the pick answer

flat out vec3 vColor;
flat out float vEmphasis;
flat out float vGrow;

flat out vec4 vSpan;
flat out vec2 vControl;
flat out float vStrandId;
out float vT;
out vec2 vWorld;

void main() {
    float t = aParam.x;
    float side = aParam.y;

    // Each edge carries its own control abscissa; they differ, so a band's thickness
    // varies along its length and the two edges are not translates of each other.
    float u = mix(iControl.x, iControl.y, side);

    // x(t) = 3u·t·(1-t) + t³, normalised. Zero at t=0 and one at t=1 for every u, so
    // both edges meet at the ends and the band closes without a seam.
    float x = iSpan.x + iSpan.z * (3.0 * u * t * (1.0 - t) + t * t * t);

    // The cubic's control ordinates are copies of its endpoints, so y collapses to
    // smoothstep. No bezier evaluation in y at all.
    float y = mix(iSpan.y, iSpan.w, t * t * (3.0 - 2.0 * t)) - side * uThickness;

    // Exact texels by integer id — no filtering, so no chance of two haplotypes'
    // appearance being blended into a third that belongs to neither.
    int id = int(iStrandId + 0.5);
    int row = int(uAppearanceRow);
    ivec2 at = ivec2(id - (id / row) * row, id / row);
    vec4 appearance = texelFetch(uAppearance, at, 0);
    vec4 modifier = texelFetch(uAppearance, at + ivec2(0, int(uAppearancePlane)), 0);

    vColor = appearance.rgb;
    vEmphasis = appearance.a;

    // The thickness floor, in world units, and how far the band has to grow to reach it.
    // Zero for every strand but the one under the feeler, and zero for that one too at any
    // zoom where the band is already thicker than the floor — so above the floor every line
    // below this is the arithmetic that was here before it existed.
    float floorWorld = modifier.r * 255.0 / uFloorSteps * uFloorPixel;

    vGrow = max(0.0, floorWorld - uThickness);

    // Grow the band by a pixel on each side so a band thinner than one pixel still
    // covers a fragment to compute coverage in. Without this a 0.19 px band would
    // simply miss every sample point and vanish. Half the floor's growth rides along, which
    // is what makes the dilation symmetric about the band's own centreline.
    y += (1.0 - 2.0 * side) * (uPad + 0.5 * vGrow);

    vSpan = iSpan;
    vControl = iControl;
    vStrandId = iStrandId;
    vT = t;
    vWorld = vec2(x, y);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
}
`

/**
 * The coverage test, shared verbatim by the visible pass and the pick pass.
 *
 * Sharing it is a correctness property rather than a tidiness one. Picking answers "which
 * band put ink in this pixel", and the only way that answer cannot drift from what the
 * screen shows is for both passes to run the *same* test over the same varyings from the
 * same vertex shader. Two copies of this arithmetic would be two opinions about where a
 * band is, and they would disagree exactly at the sub-pixel edges where it matters.
 */
const COVERAGE = /* glsl */`
uniform float uThickness;
uniform float uHalfPixel;

flat in vec4 vSpan;
flat in vec2 vControl;
flat in float vGrow;
in float vT;
in vec2 vWorld;

/**
 * Recover the curve parameter at this fragment's own x. The rungs give a value that is
 * close — it is linearly interpolated between two points on a curve — and two Newton
 * steps from there are exact to well inside a pixel.
 *
 * f(t)  = 3u·t·(1-t) + t³ - p
 * f'(t) = 3u·(1-2t) + 3t²,  which bottoms out at 3u(1-u) > 0, so this cannot stall.
 */
float parameterAt(float p, float u, float t) {
    for (int i = 0; i < 2; i += 1) {
        float f = 3.0 * u * t * (1.0 - t) + t * t * t - p;
        float d = 3.0 * u * (1.0 - 2.0 * t) + 3.0 * t * t;

        t -= f / max(d, 1e-5);
    }

    return clamp(t, 0.0, 1.0);
}

/**
 * What fraction of this pixel's height the band actually fills. A band covering a fifth
 * of the pixel returns exactly a fifth — this is what MSAA, which can only answer in
 * quarters, cannot do. Zero means the band put no ink in this pixel at all.
 *
 * Horizontal coverage at the two ends is ignored. Bands lap their neighbours by a whole
 * unit and are hundreds of units wide, so the ends are interior to the strand.
 */
float bandCoverage() {
    float p = clamp((vWorld.x - vSpan.x) / vSpan.z, 0.0, 1.0);

    // Each edge has its own control abscissa, so each needs its own parameter at this x.
    float tTop = parameterAt(p, vControl.x, vT);
    float tBot = parameterAt(p, vControl.y, vT);

    // The two edges of the band, moved apart by the floor and by nothing else. vGrow is zero
    // unless this strand is floored and under-thick at this zoom, and half of it goes to each
    // edge, so the centreline between them does not move: the band says exactly where the
    // haplotype is, and only lies about how thick it is.
    float yTop = mix(vSpan.y, vSpan.w, tTop * tTop * (3.0 - 2.0 * tTop)) + 0.5 * vGrow;
    float yBot = mix(vSpan.y, vSpan.w, tBot * tBot * (3.0 - 2.0 * tBot)) - uThickness - 0.5 * vGrow;

    float lo = max(yBot, vWorld.y - uHalfPixel);
    float hi = min(yTop, vWorld.y + uHalfPixel);

    return clamp((hi - lo) / (2.0 * uHalfPixel), 0.0, 1.0);
}
`

/**
 * Coverage decides how much of the pixel the band fills; emphasis decides how much of that
 * it is allowed to claim.
 *
 * Receding a strand turns it into a ghost of itself rather than repainting it: whatever is
 * behind it shows through, including the focused strand it crosses over. Emphasis reaches
 * alpha and never `vColor`, so the PCLAI colour a researcher reads across PGB's three panels
 * is not distorted by highlighting — see `strandAppearance.ts`.
 */
const FRAGMENT = /* glsl */`
precision highp float;
${COVERAGE}

flat in vec3 vColor;
flat in float vEmphasis;

out vec4 fragColor;

void main() {
    float coverage = bandCoverage();

    if (0.0 >= coverage) {
        discard;
    }

    // One multiply, and only ever downward: the focused strand and a map with no key held
    // are both emphasis 1 and are drawn identically. Nothing here can brighten a band
    // beyond what the document gave it, which is CONTEXT.md #15 held to literally.
    fragColor = vec4(vColor, coverage * vEmphasis);
}
`

/**
 * The pick pass: the same bands, drawn as their own strand ids.
 *
 * Two bytes of colour carry the id, low byte first, which is why `MAX_STRAND_ID` is 65535
 * — the parser refuses a document that would wrap this.
 *
 * **Alpha is the hit flag, not a colour.** Every fragment this keeps writes alpha 1, and
 * the target is cleared to alpha 0, so "no band here" is distinguishable from strand 0 —
 * which is a real haplotype (`CHM13#0#chr1` on every document we have) and would
 * otherwise be indistinguishable from empty space.
 *
 * There is no blending and no depth buffer, so within one texel the last fragment written
 * wins. Instances are drawn in document order, so that is the topmost band — the same answer
 * SVG's own hit-testing gave, and the one the researcher is looking at where strands cross.
 *
 * **That rule used to decide the whole answer, and no longer does.** The pick target is a
 * column of texels across the cursor's one css pixel rather than a single texel (#120), so
 * last-write-wins now settles only which band owns each `1/N` css px sample, and the strands
 * at the other samples survive into the answer instead of being overwritten by it. Where two
 * bands genuinely overlap inside one sample, the topmost still wins — which is what a
 * researcher pointing at a crossing is looking at.
 *
 * **Emphasis is deliberately not applied here.** The visible pass multiplies coverage by
 * the strand's emphasis; this one does not, because a receded strand is exactly what the
 * feeler is reaching for next. A pick pass that dimmed with the picture would make the
 * strands a sweep has not yet touched progressively harder to touch.
 *
 * **Nor is the thickness floor**, which `bandPicker.ts` switches off by setting `uFloorPixel`
 * to zero. This is the one place the two passes are allowed to disagree about where a band
 * is, and the reason is a loop: the floor is applied to the strand the pick *answered with*,
 * so honouring it here would let that answer widen its own target. At fit the floored strand
 * would cover ten of its neighbours' rows and a sweep could never reach past it. The floor is
 * a way of showing the researcher the strand they have got, not a way of getting it.
 */
const PICK_FRAGMENT = /* glsl */`
precision highp float;
${COVERAGE}

flat in float vStrandId;

out vec4 fragColor;

void main() {
    if (0.0 >= bandCoverage()) {
        discard;
    }

    float low = mod(vStrandId, 256.0);
    float high = floor(vStrandId / 256.0);

    fragColor = vec4(low / 255.0, high / 255.0, 0.0, 1.0);
}
`

/** The GPU side, built on the first document and kept for the life of the mount. */
interface Context {
    renderer: WebGLRenderer
    scene: Scene
    camera: OrthographicCamera
    controls: MapControls
    material: RawShaderMaterial
    pickMaterial: RawShaderMaterial
    picker: BandPicker
}

/** The document currently on screen, and the resources drawing it. */
interface Drawing {
    map: ParsedMap
    geometry: InstancedBufferGeometry
    mesh: Mesh
    /** How each of this document's strands looks. Sized from its own strand count. */
    appearance: StrandAppearance
    /**
     * What each of its haplotypes' direction is called on screen, by strand id, and `null`
     * for the ones there is nothing to say about (#132).
     *
     * Read once, when the document arrives, because it is a fold over every band the
     * document draws — 11,586 of them on the inverted fixture — and the answer cannot change
     * while that document is on screen. The three surfaces that name a haplotype then index
     * it, so none of them can disagree with the caption or with each other.
     */
    readings: Array<HaplotypeReading | null>
}

/**
 * What the mount knows about the surface, and all it knows.
 *
 * `mountTubeMapSurface` owns the container, the fetch, the spinner and the error state;
 * everything about the *view* — fitting, zooming, what a resize does to the framing —
 * is behind these four calls, because none of it is the mount's business.
 *
 * `show` takes the response text rather than a parsed document: reading the bytes into
 * six floats per band is this surface's own act, and the gate that can refuse them is
 * part of it.
 *
 * This lived in `surfaceRenderer.ts` until 2026-08-16, where it was the vocabulary two
 * surfaces answered in. #40 left one, so it is declared beside the one.
 */
export interface BandSurface {
    /**
     * Display the document. Throws if it cannot be drawn — the mount turns that into the
     * error state, so the surface never shows half a map.
     */
    show(text: string): void
    /** Drop the current document, leaving the surface empty and ready for another. */
    clear(): void
    /**
     * The container changed size. Preserve the view and reveal more or less of the map,
     * except that a view still untouched at initial fit re-fits (`CONTEXT.md` #10).
     */
    resize(): void
    /** Remove every listener, node and GPU resource this surface created. */
    destroy(): void
}

export interface BandSurfaceOptions {
    /**
     * Report the strand under the cursor, what asking cost, and what the feeler's table
     * write cost, in a corner of the surface. Harness instrumentation, `?pick`: it is what
     * made the pick answer checkable against the document by hand (#38) and what states
     * the highlight cost rather than asserting it (#39).
     */
    pickReadout?: boolean
    /**
     * Override how thick the feeler draws the strand it is on, in css pixels. Defaults to
     * `FLOOR_CSS_PX`; zero switches the floor off.
     *
     * Harness instrumentation, `?floor=`: the value is a judgement made by looking at a
     * sweep of candidates (#112), and this is what puts a candidate on screen. Nothing in
     * the product passes it.
     */
    strandFloorCssPx?: number
    /**
     * Override how finely the pick pass samples the cursor's css pixel. Defaults to
     * `PICK_SAMPLES`; `1` is the single-texel target the pass used before #120.
     *
     * Harness instrumentation, `?samples=`: the shipped value is a measurement, and this is
     * what makes it one — `scripts/verify_pick_set.mjs` drives the sweep through it. Nothing
     * in the product passes it. It changes the pick's *resolution* only; the window it
     * samples is one css pixel of map at every value.
     */
    pickSamples?: number
    /**
     * Called with the strand under the feeler, or `null`, on the same transition that writes
     * the appearance table — so what is lit, what is named and whatever else reports on the
     * gesture can never be given different answers.
     *
     * Push, not poll: a listener never reaches into the renderer or a frame loop, and this
     * surface never learns what a listener does with the answer. The PCLAI inset is driven
     * through the same transition, and this is the seam a cross-panel link into PGB's 3D
     * graph or annotation track would attach to — ADR 0001's deferred obligation. Nothing
     * here builds one, and nothing here publishes: the panel stays bus-silent.
     */
    onFocusStrand?(strandId: number | null): void
}

export function createBandSurface(host: HTMLElement, options: BandSurfaceOptions = {}): BandSurface {

    const doc = host.ownerDocument

    const canvas = doc.createElement('canvas')
    canvas.className = 'stm-canvas'
    host.append(canvas)

    // Mounted straight after the canvas, so it is over the map and under everything the
    // mount layers on top — the navigator, the badge, and the status layer that has to be
    // able to cover a refused document's error message with nothing showing through it.
    const segments: SegmentOverlay = createSegmentOverlay(host)

    // What the whole document says about itself — how many of its haplotypes are inverted
    // (#131). Shown and emptied in the same calls the scene is, like the segment boxes and
    // the cloud, and inert to the pointer: it reports on the map and takes nothing from it.
    //
    // **Before the strand label, and that is load-bearing.** The two share z-index 3, so the
    // later mount wins where they overlap, and the label is drawn above the cursor and
    // clamped to the top edge — so a feeler gesture near the top of the map puts the two in
    // the same place. The label is what the researcher is reading at that moment and the
    // caption is a standing statement they have already read, so the label wins.
    const inversionNote: InversionNote = createInversionNote(host)

    // What the feeler is touching, by name (#111). Mounted over the segments so a name is
    // never covered by a box, and inert, so the map underneath keeps answering the cursor.
    const strandLabel: StrandLabel = createStrandLabel(host)

    const readout = true === options.pickReadout ? doc.createElement('div') : null

    if (null !== readout) {
        readout.className = 'stm-pick'
        readout.textContent = 'strand —'
        host.append(readout)
    }

    let context: Context | null = null
    let drawing: Drawing | null = null
    /** True until the researcher moves the view — a resize re-fits only while the framing is still ours. */
    let untouched = true
    let frame = 0
    /** Where the pointer last was, in css pixels from the canvas, or null once it leaves. */
    let cursor: Point | null = null
    let pickFrame = 0
    let worstPick = 0
    /** Wall-clock cost of appearance-table writes, in ms — the last one and the worst so far.
     *  Both, because the worst alone cannot tell a cost that drifts from a flat one with an
     *  outlier in it, and flatness is the claim. Only measured when the readout is mounted. */
    let lastWrite = 0
    let worstWrite = 0
    /** The viewport the camera was last framed for. Kept so `draw` — which runs on every
     *  panned frame — never reads layout back out of the DOM to place the navigator rect. */
    let framed: Viewport = { width: 0, height: 0 }

    const mapNavigator: NavigatorHandle = createNavigator(host, {
        onNavigate(center: Point): void {
            if (null === context || null === drawing) {
                return
            }

            const { camera, controls } = context
            const world = worldFromContentPoint(center, drawing.map.content)

            // `MapControls` pans by moving the camera and its target together; moving one
            // of them alone would tilt a camera that is meant to stay square to the map.
            camera.position.set(world.x, world.y, camera.position.z)
            controls.target.set(world.x, world.y, 0)

            // The change this announces schedules the frame, and marks the framing as the
            // researcher's — which it is, since they just asked for it.
            controls.update()
        }
    })

    // Where every haplotype in this document sits in the ancestry cloud (#113). Mounted and
    // emptied in the same calls the scene is, like the segment boxes, and inert to the
    // pointer: it reports on the map and takes nothing from it. It reads the parsed document
    // and nothing else — no camera, no frame loop, and no event bus.
    //
    // **After the navigator, and that is load-bearing.** The two widgets share z-index 2, so
    // the later mount wins where they overlap. Grown large in a short panel the cloud reaches
    // the navigator, and mounted first it was the navigator that answered the pointer at the
    // cloud's own resize grip — leaving a widget that could no longer be resized. The
    // navigator is a picture; the grip is a control, and a control that cannot be reached is
    // worse than a thumbnail partly covered. The cloud can also be dragged off it, or hidden.
    const pclaiInset: PclaiInset = createPclaiInset(host)

    function viewport(): Viewport {
        return { width: canvas.clientWidth, height: canvas.clientHeight }
    }

    /**
     * Build the context on the first document rather than at mount, so a machine without
     * WebGL fails into the mount's error state instead of throwing out of `mount`.
     */
    function gpu(): Context {
        if (null !== context) {
            return context
        }

        let renderer: WebGLRenderer

        try {
            // No hardware multisampling: coverage is computed per fragment, and MSAA on
            // top of it would sample an already-antialiased edge and double-count.
            renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, premultipliedAlpha: false })
        } catch (error) {
            throw new Error(
                `This browser could not open a WebGL context — ${error instanceof Error ? error.message : String(error)}`
            )
        }

        // Bands carry the colours the document gave them, byte for byte: we are reproducing
        // a picture, not lighting a scene. Nothing here converts colour, and nothing needs
        // the `ColorManagement` global turned off to keep it that way (`pgb#89`) — the
        // bands are a `RawShaderMaterial`, which three appends no conversion to, over a
        // `DataTexture` left at `NoColorSpace`. This is per renderer, so PGB's own renderer
        // — which does light a scene, and wants sRGB output — is untouched by it.
        renderer.outputColorSpace = LinearSRGBColorSpace

        // White and black are the two colours the sRGB transfer function fixes, so the
        // clears come out the same whatever the global happens to say.
        renderer.setClearColor(0xffffff, 1)

        const scene = new Scene()
        const camera = new OrthographicCamera()

        camera.position.set(0, 0, 5)
        camera.near = 0.1
        camera.far = 100

        // On the host, not the canvas: see "Where the pointer is taken" above. `MapControls`
        // binds its own `pointerdown` and `wheel` to what it is given, so chrome over the
        // map keeps those to itself through `shieldFromMap`.
        const controls = new MapControls(camera, host)

        // PGB's configuration, verbatim. A researcher crosses between the two viewers
        // constantly and must not have to change hands.
        controls.zoomToCursor = true
        controls.enableRotate = false
        controls.screenSpacePanning = true
        controls.zoomSpeed = 1.2
        controls.panSpeed = 1
        controls.target.set(0, 0, 0)

        // Every camera change is announced, including the clamps `update()` applies, so
        // this is the only thing that ever asks for a frame.
        controls.addEventListener('change', () => {
            untouched = false
            scheduleDraw()
        })

        const material = new RawShaderMaterial({
            glslVersion: GLSL3,
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: bandUniforms(),
            // Coverage arrives as alpha, so the surface blends. There is no depth buffer:
            // bands are opaque in the document and painted in order, so instance order
            // carries z-order where two strands cross.
            transparent: true,
            depthTest: false,
            depthWrite: false
        })

        // The band material's twin: same vertex shader, so picking rasterizes exactly the
        // geometry drawing does, and the same coverage test, so it agrees about which
        // pixels a band put ink in. Only what it writes differs.
        const pickMaterial = new RawShaderMaterial({
            glslVersion: GLSL3,
            vertexShader: VERTEX,
            fragmentShader: PICK_FRAGMENT,
            uniforms: bandUniforms(),
            // Ids are not colours: blending two of them would produce a third that names
            // a strand neither band belongs to. Without blending the last write wins, and
            // instance order is document order, so that is the topmost band.
            transparent: false,
            blending: NoBlending,
            depthTest: false,
            depthWrite: false
        })

        context = {
            renderer,
            scene,
            camera,
            controls,
            material,
            pickMaterial,
            picker: createBandPicker(renderer, scene, pickMaterial, options.pickSamples ?? PICK_SAMPLES)
        }

        return context
    }

    /** Frame the camera for the current viewport, leaving the view where it is. */
    function reframe(): void {
        if (null === context || null === drawing) {
            return
        }

        const size = viewport()

        if (false === usable(size)) {
            return
        }

        const { renderer, camera, controls } = context

        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(size.width, size.height, false)

        frameCamera(camera, size)

        // Fit moves with the viewport, so the clamp does too — and `update()` is what
        // pulls the current zoom back inside it.
        const range = zoomRange(drawing.map.content, size)

        controls.minZoom = range.min
        controls.maxZoom = range.max
        controls.update()

        framed = size

        scheduleDraw()
    }

    /** Open on the whole map: fit to width, centred. The content is centred on the origin. */
    function fit(): void {
        if (null === context || null === drawing) {
            return
        }

        const size = viewport()

        if (false === usable(size)) {
            return
        }

        const { camera, controls } = context

        camera.position.set(0, 0, 5)
        camera.zoom = zoomRange(drawing.map.content, size).min

        // `controls.update()` rebuilds the projection matrix only when it changes the
        // zoom itself. Setting it here and leaving that to the controls opens the map at
        // whatever the previous zoom was — 78× on `5520+`, which looks like a working
        // renderer showing three haplotypes.
        camera.updateProjectionMatrix()

        controls.target.set(0, 0, 0)
        controls.update()

        // After the update, because the change it announces would otherwise mark this
        // framing as the researcher's own.
        untouched = true

        scheduleDraw()
    }

    function scheduleDraw(): void {
        if (0 !== frame) {
            return
        }

        frame = requestAnimationFrame(() => {
            frame = 0
            draw()
        })
    }

    function draw(): void {
        if (null === context || null === drawing) {
            return
        }

        const { renderer, scene, camera, material } = context

        const view = { x: camera.position.x, y: camera.position.y, zoom: camera.zoom }

        setCoverage(material, camera.zoom, renderer.getPixelRatio())
        renderer.render(scene, camera)

        // The same frame that drew the canvas, so the boxes cannot lag the map they annotate
        // by one pan step. One transform on the wrapper, plus whichever boxes crossed the
        // visibility threshold since the last frame.
        segments.update(view, framed)

        // Two style writes on an element that is already in the DOM. The thumbnail under
        // it is untouched — it was rendered once, at load.
        mapNavigator.update(visibleContentRect(view, framed, drawing.map.content))
    }

    /**
     * Ask what the cursor is over, at most once per frame.
     *
     * Coalescing to `requestAnimationFrame` rather than picking per event is what keeps
     * this bounded: pointer devices report well above 60 Hz and every pick is a
     * synchronous readback, so answering each event would stall the pipeline several
     * times for one frame's worth of movement — and only the last answer is ever read.
     */
    function schedulePick(): void {
        if (0 !== pickFrame) {
            return
        }

        pickFrame = requestAnimationFrame(() => {
            pickFrame = 0
            runPick()
        })
    }

    function runPick(): void {
        if (null === context || null === drawing || null === cursor) {
            return
        }

        const { camera, picker } = context
        const result = picker.pick(
            cursor,
            framed,
            { x: camera.position.x, y: camera.position.y, zoom: camera.zoom }
        )

        // The worst pick is the number that decides whether this is usable at pointer
        // rate; a mean hides exactly the stalls being hunted.
        worstPick = Math.max(worstPick, result.milliseconds)

        // The feeler emphasizes what is under it *now*: moving on hands the emphasis to the
        // next strand, and over empty space nothing is emphasized while the map stays
        // receded. Over-empty-space is a real state, not the absence of one — a sweep
        // crosses gaps between bands constantly, and springing back to full colour in each
        // of them would strobe.
        if (feeler.active()) {
            touch(result)
        }

        if (null === readout) {
            return
        }

        // The whole set, not the strand that happens to be lit: the readout's job is to say
        // what the pass answered, and the count is the number #120 is about.
        const picked = 0 === result.strandIds.length ? '—' : result.strandIds.join(' ')
        const shown = drawing.appearance.focused()

        // The focused strand's direction beside its id (#132) — the readout is where the
        // pick answer is checked against the document by hand, and a haplotype's direction is
        // now part of that answer. Absent, like everything else here, when there is nothing
        // to say: an em dash for no focus, and no parenthesis at all for a document with no
        // reference direction to read against.
        const direction = null === shown ? null : drawing.readings[shown]

        readout.textContent = `strand ${picked} · ${result.milliseconds.toFixed(2)} ms`
            + ` · worst ${worstPick.toFixed(2)} ms`
            + ` · focus ${null === shown ? '—' : shown}`
            + (null === direction ? '' : ` (${direction})`)
            + ` · table ${lastWrite.toFixed(3)} ms, worst ${worstWrite.toFixed(3)} ms`
    }

    /**
     * Move the emphasis to one strand, or to none.
     *
     * This is the whole cost of highlighting: two bytes per strand in the appearance table —
     * emphasis and thickness floor — nothing per band, then a 4 KB upload on the frame that
     * draws it. It is timed rather
     * than asserted — but only while the readout is mounted, so the clock stays out of the
     * path when nobody is reading it.
     */
    function focus(strandId: number | null): void {
        if (null === drawing) {
            return
        }

        const started = null === readout ? 0 : performance.now()

        // A sweep re-reports the same haplotype for many frames running — a strand is 87
        // bands wide on `5520+` — and a move that changes nothing must not cost an upload.
        if (false === drawing.appearance.focus(strandId)) {
            return
        }

        if (null !== readout) {
            lastWrite = performance.now() - started
            worstWrite = Math.max(worstWrite, lastWrite)
        }

        scheduleDraw()
    }

    /**
     * Say what the strands under the feeler are called, beside the cursor, or say nothing.
     *
     * Read from the parsed document rather than asked of the GPU: the pick pass answers
     * with strand ids, and `strandNames` is what turns those integers into the things a
     * researcher can write down. `strandCss` gives each one the colour it already has in the
     * cloud, so the label's swatches and the cloud's dots are the same marks. Over empty space there are no names — the same state the
     * emphasis takes, and for the same reason.
     *
     * The list arrives in screen order and is passed on in it, alongside which of them the
     * map has lit, so the label can never disagree with the appearance table about the
     * strand the feeler has.
     *
     * Placed from `cursor` and `framed` rather than from the event, because this runs on
     * the pick frame: both are already the surface's own numbers and neither costs a
     * layout read.
     */
    function nameStrands(column: StrandColumn): void {
        if (null === drawing || null === cursor || 0 === column.strandIds.length) {
            strandLabel.hide()
            return
        }

        const { strandNames, strandColors } = drawing.map
        const { readings } = drawing

        strandLabel.show(
            column.strandIds.map(id => ({
                name: strandNames[id],
                color: strandCss(strandColors, id),
                direction: readings[id]
            })),
            column.nearest,
            cursor,
            framed
        )
    }

    /**
     * Hand the feeler the strands under it, and say which one it has: what is lit and what is
     * named are one answer to one question, and the two must never be given different ones.
     *
     * **The set is named and one strand is lit** — `CONTEXT.md` §feeler states the policy and
     * why it is one rather than all of them. The column arrives as a single answer with the
     * lit strand's *position* in it, so nothing here has to pair the two up and nothing here
     * can pair them up wrongly.
     */
    function touch(column: StrandColumn): void {
        const lit = column.strandIds[column.nearest] ?? null

        focus(lit)
        nameStrands(column)
        tellSegments(lit)
        pclaiInset.focus(column.strandIds, column.nearest)
        options.onFocusStrand?.(lit)
    }

    /**
     * Hand the segment tooltip the haplotype the feeler has, so a researcher reading a box
     * can see which haplotype they are reading it through and which way it runs (#132).
     *
     * Only where there is a direction to state — `inversion.ts` decides when that is. A
     * haplotype's name in that table without one would be a third place the viewer says what
     * the label and the readout already say, bought at the price of two rows in every tooltip
     * of every document in the corpus but one: the row is the direction's, not the name's.
     */
    function tellSegments(lit: number | null): void {
        if (null === drawing || null === lit) {
            segments.feel(null)
            return
        }

        const direction = drawing.readings[lit]

        segments.feel(null === direction ? null : { name: drawing.map.strandNames[lit], direction })
    }

    /**
     * `Shift` down: the cursor becomes a feeler.
     *
     * The controls are switched off for the duration, which is `CONTEXT.md` #13 — `Shift`
     * arbitrates pointer ownership, so the two interaction sets are mutually exclusive by
     * construction. A pan or a wheel mid-sweep would slide the strand out from under the
     * cursor, which is the one thing a feeler cannot survive.
     */
    function enterFeelerMode(): void {
        if (null === context) {
            return
        }

        context.controls.enabled = false

        // The map recedes on the key alone, before any movement: the mode is legible
        // immediately, and holding `Shift` over a strand emphasizes it without a nudge.
        // Nothing is named until the pick answers — a name is an answer about one strand,
        // and at this instant the mode has not asked yet.
        touch(NOTHING)
        schedulePick()
    }

    /** `Shift` up: the emphasis goes with it, and so does the name. Both are the mode, not
     *  a state — a name left on screen would refer to a strand that is no longer lit. */
    function leaveFeelerMode(): void {
        if (null !== context) {
            context.controls.enabled = true
        }

        strandLabel.hide()
        tellSegments(null)
        pclaiInset.focus(NOTHING.strandIds, NOTHING.nearest)
        options.onFocusStrand?.(null)

        if (true === drawing?.appearance.release()) {
            scheduleDraw()
        }
    }

    const feeler: FeelerKey = watchFeelerKey({
        root: host,
        onEnter: enterFeelerMode,
        onLeave: leaveFeelerMode
    })

    function onPointerMove(event: PointerEvent): void {
        // Chrome over the map is not the map, whatever it is drawn on top of: a sweep that
        // wanders onto the navigator is a cursor that has left, not one hovering the strand
        // the navigator happens to cover.
        //
        // `offsetX`/`offsetY` are gone with the move to the root — they would be an offset
        // into whatever element the cursor is over, which is the canvas only when nothing is
        // mounted above it. `getBoundingClientRect` per move is what that costs; it reads
        // clean layout on a surface whose moves write nothing to the DOM.
        const point = overChrome(event.target)
            ? null
            : canvasPoint({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect())

        if (null === point) {
            cursorLeft()
            return
        }

        cursor = point

        // Hover alone does nothing (`CONTEXT.md` #14): with no key held and no readout
        // asking, there is nobody to answer, and a pick nobody reads is pure cost.
        if (feeler.active() || null !== readout) {
            schedulePick()
        }
    }

    /**
     * The cursor is nowhere the map can answer for — off the root, or over chrome.
     *
     * The emphasis does not follow it out: the key is still held, so the mode is still on,
     * and there is simply no strand under a cursor that is somewhere else. Whatever was
     * emphasized recedes with the rest.
     */
    function cursorLeft(): void {
        if (null === cursor) {
            return
        }

        cursor = null

        if (feeler.active()) {
            touch(NOTHING)
        }

        if (null !== readout) {
            readout.textContent = 'strand —'
        }
    }

    /**
     * Say that a pan is under way, so the cursor can look like one for its whole duration.
     *
     * This is a class rather than `:active`, and that is the whole point. `MapControls`
     * takes pointer capture on the root when the drag begins, and a captured pointer stops
     * hit-testing for `:hover` and `:active` — the capture target takes them instead. So the
     * canvas's own `cursor: grab` stopped applying the instant the drag actually started,
     * and the root, which had no cursor of its own, fell back to the arrow. Pressing showed
     * the grabbing hand and moving took it away, which is exactly backwards.
     *
     * Bound here rather than to the controls' own `start`/`end`, which also fire around a
     * wheel notch and would flash the hand at someone who is zooming.
     */
    function onPointerDown(event: PointerEvent): void {
        // Primary button only, and never while the map is being felt — the controls are
        // switched off there, so a grabbing hand would promise a pan that cannot happen.
        if (0 !== event.button || feeler.active() || overChrome(event.target)) {
            return
        }

        host.classList.add('is-panning')
    }

    function onPointerUp(): void {
        host.classList.remove('is-panning')
    }

    // On the root: leaving the canvas for the navigator no longer leaves anything the
    // canvas would hear about, so this catches only the pointer leaving the surface
    // altogether and `onPointerMove` catches the rest.
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerleave', cursorLeft)
    host.addEventListener('pointerdown', onPointerDown)

    // On the document, because most drags of a map end somewhere off it: released outside
    // the root, the class would stick and the surface would look permanently grabbed.
    doc.addEventListener('pointerup', onPointerUp)
    doc.addEventListener('pointercancel', onPointerUp)

    /**
     * Render the whole map into an offscreen target at thumbnail size and read it back.
     *
     * Same scene, same shader, same instance buffer — only the camera differs, so the
     * navigator cannot disagree with the surface about what the map looks like. That was
     * the objection to the alternative, which was to serialize a second copy of the
     * document and let the browser rasterize it: two pictures from two pipelines, with
     * nothing keeping them the same.
     *
     * Once per document. Nothing here runs while panning.
     */
    function paintThumbnail(target2d: HTMLCanvasElement, size: Size, pixelRatio: number): void {
        if (null === context || null === drawing) {
            return
        }

        const context2d = target2d.getContext('2d')

        if (null === context2d) {
            return
        }

        context2d.putImageData(renderThumbnail(context, drawing.map.content, size, pixelRatio), 0, 0)

        // Nothing on the visible canvas changed — this is only what puts the rect on the
        // thumbnail that was just drawn under it.
        scheduleDraw()
    }

    function releaseDrawing(): void {
        if (null === drawing || null === context) {
            return
        }

        context.scene.remove(drawing.mesh)
        drawing.geometry.dispose()
        drawing.appearance.dispose()
        drawing = null

        // The table belonged to the document that just went away, and a sampler left
        // pointing at a disposed texture is how the next document gets drawn in the
        // previous one's colours.
        bindAppearance(context, null)
    }

    return {

        show(text: string): void {
            // Both readings of the document before anything is built, and both able to
            // refuse it: a box the grammar cannot read is a variant nobody would notice was
            // missing, so it refuses the whole map exactly as a non-conforming band does.
            const map = parseBands(text)
            const boxes = parseSegmentBoxes(text, map.centre)
            const built = gpu()

            releaseDrawing()

            const geometry = buildLadder(RUNGS)

            geometry.setAttribute('iSpan', deinterleave(map.geometry, 6, 0, 4, map.bandCount))
            geometry.setAttribute('iControl', deinterleave(map.geometry, 6, 4, 2, map.bandCount))

            // Colour is not an instance attribute. It is a texel the vertex shader fetches
            // by strand id, which is what makes highlighting a table write — see
            // `strandAppearance.ts`.
            const appearance = createStrandAppearance(map, { floorCssPx: options.strandFloorCssPx })

            bindAppearance(built, appearance)

            // The parser's own array, uploaded without a copy. Declared `in float` in the
            // shader, so GL widens the two bytes on the way in and nothing here has to
            // decide whether an integer attribute is worth the plumbing.
            geometry.setAttribute('iStrandId', new InstancedBufferAttribute(map.strandIds, 1))
            geometry.instanceCount = map.bandCount

            const mesh = new Mesh(geometry, built.material)

            // The whole map is one object and it is always in view; culling it per frame
            // would compute a bounding sphere over 40,442 instances to learn nothing.
            mesh.frustumCulled = false
            built.scene.add(mesh)

            // Both of the document's direction answers, folded once: how many haplotypes are
            // inverted, which the caption states, and which of them are, which the three
            // surfaces that name a haplotype say.
            const inversion = readInversion(map)

            drawing = { map, geometry, mesh, appearance, readings: inversion.readings }

            segments.show(boxes)

            // What this document is a picture of, said in words: how many of its haplotypes
            // run against GRCh38's own direction, or nothing at all where none do and where
            // there is no GRCh38 to read against.
            inversionNote.show(inversion.census)

            // This document's cloud, replacing the previous one's. Opening another node
            // rebuilds it here, which is the only place it is ever built.
            pclaiInset.show(map)

            reframe()
            fit()

            // Synchronous — a render target read back on the same frame the map arrived,
            // so the navigator is never briefly a blank box beside a drawn map.
            void mapNavigator.setMap(map.content, paintThumbnail)
        },

        clear(): void {
            // Before the drawing goes: the mode owns the controls and the cursor, and
            // leaving it held over an empty surface would leave both switched off.
            feeler.release()
            strandLabel.hide()
            releaseDrawing()

            // In the same call that empties the scene, so a refused document cannot leave
            // the previous map's boxes floating over an error message.
            segments.clear()
            inversionNote.clear()
            pclaiInset.clear()
            mapNavigator.clear()

            if (null !== context) {
                context.renderer.clear()
            }

            untouched = true
        },

        resize(): void {
            // Resizing reveals more or less of the map rather than re-framing it —
            // unless the researcher has not yet invested in a position, in which case
            // the opening framing should stay correct.
            //
            // Read before reframing, not after: raising the floor under a zoom that was
            // already at fit moves the camera, and the change that announces would look
            // exactly like the researcher having moved it.
            const refit = untouched

            mapNavigator.relayout()
            pclaiInset.relayout()
            reframe()

            if (refit) {
                fit()
            }
        },

        destroy(): void {
            if (0 !== frame) {
                cancelAnimationFrame(frame)
                frame = 0
            }

            if (0 !== pickFrame) {
                cancelAnimationFrame(pickFrame)
                pickFrame = 0
            }

            host.removeEventListener('pointermove', onPointerMove)
            host.removeEventListener('pointerleave', cursorLeft)
            host.removeEventListener('pointerdown', onPointerDown)
            doc.removeEventListener('pointerup', onPointerUp)
            doc.removeEventListener('pointercancel', onPointerUp)
            feeler.destroy()
            strandLabel.destroy()
            inversionNote.destroy()
            pclaiInset.destroy()
            segments.destroy()
            readout?.remove()

            releaseDrawing()
            mapNavigator.destroy()

            if (null !== context) {
                context.controls.dispose()
                context.material.dispose()
                context.picker.dispose()
                context.pickMaterial.dispose()

                // `dispose()` releases three's own resources but **not** the WebGL
                // context; only `forceContextLoss()` does, and browsers cap live
                // contexts near 16.
                context.renderer.forceContextLoss()
                context.renderer.dispose()
                context = null
            }

            canvas.remove()
        }
    }
}

/**
 * The whole map at thumbnail size, as pixels.
 *
 * The camera is the surface's own arithmetic at a different zoom: a pixel-measured
 * frustum the size of the thumbnail, at exactly the zoom that fits the content's width
 * into it. So the thumbnail is the map fitted to a 720 px window and nothing more
 * special than that.
 *
 * The coverage uniforms follow the thumbnail's device pixel, which is ~300 world units
 * wide: `uPad` grows every band to fill one, and the fragment shader gives it an alpha of
 * its true 15 units over that pixel's height. Bands that would fall between sample points
 * therefore accumulate into the pixel they belong to instead of dropping out — the
 * difference between a thumbnail of a map and a thumbnail of whichever strands happened to
 * land on a sample row.
 *
 * `readRenderTargetPixels` hands back rows bottom-up, as GL stores them; `ImageData` wants
 * them top-down.
 */
function renderThumbnail(context: Context, content: Size, size: Size, pixelRatio: number): ImageData {
    const { renderer, scene, material } = context

    const width = Math.max(1, Math.round(size.width * pixelRatio))
    const height = Math.max(1, Math.round(size.height * pixelRatio))

    const camera = new OrthographicCamera()

    camera.near = 0.1
    camera.far = 100
    camera.position.set(0, 0, 5)
    camera.zoom = fitZoom(content, size)
    frameCamera(camera, size)

    // Including the floor's css pixel, which at this camera is ~150 world units. Nothing is
    // floored while this runs — the thumbnail is painted once, on the frame the document
    // arrives, when no strand is under a feeler — but the uniform is borrowed and handed back
    // with the other two rather than left to be true by luck.
    const surfaceCoverage = {
        halfPixel: material.uniforms.uHalfPixel.value,
        pad: material.uniforms.uPad.value,
        floorPixel: material.uniforms.uFloorPixel.value
    }

    setCoverage(material, camera.zoom, pixelRatio)

    const target = new WebGLRenderTarget(width, height)
    const pixels = new Uint8Array(width * height * 4)

    try {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
    } finally {
        // The material is the surface's own, so everything borrowed from it is handed
        // back here rather than left for the next frame to notice.
        renderer.setRenderTarget(null)
        material.uniforms.uHalfPixel.value = surfaceCoverage.halfPixel
        material.uniforms.uPad.value = surfaceCoverage.pad
        material.uniforms.uFloorPixel.value = surfaceCoverage.floorPixel
        target.dispose()
    }

    const image = new ImageData(width, height)

    for (let row = 0; row < height; row += 1) {
        const from = row * width * 4
        const to = (height - 1 - row) * width * 4

        image.data.set(pixels.subarray(from, from + width * 4), to)
    }

    return image
}

/**
 * The uniforms both materials carry, which are the same uniforms because both run the same
 * vertex shader — including its appearance lookup. The pick pass writes strand ids rather than
 * colour and reads nothing back out of the table, but the fetch still happens, so the sampler
 * has to be bound there too.
 *
 * `uAppearance` is filled in by `show`: the table is sized from the document's strand count,
 * so there is nothing to bind until one is parsed.
 */
function bandUniforms(): Record<string, { value: unknown }> {
    return {
        uThickness: { value: THICKNESS },
        uHalfPixel: { value: 0 },
        uPad: { value: 0 },
        uAppearance: { value: null },
        uAppearanceRow: { value: APPEARANCE_ROW },
        uAppearancePlane: { value: 0 },
        uFloorPixel: { value: 0 },
        uFloorSteps: { value: FLOOR_STEPS_PER_PX }
    }
}

/**
 * Point both materials at one document's appearance table, or at none.
 *
 * The plane offset travels with the texture because it is a property of that table: it is
 * the document's own row count, so binding one without the other is how a strand's floor
 * gets read out of another strand's colour.
 */
function bindAppearance(context: Context, appearance: StrandAppearance | null): void {
    const texture = null === appearance ? null : appearance.texture
    const plane = null === appearance ? 0 : appearance.planeRows

    context.material.uniforms.uAppearance.value = texture
    context.material.uniforms.uAppearancePlane.value = plane
    context.pickMaterial.uniforms.uAppearance.value = texture
    context.pickMaterial.uniforms.uAppearancePlane.value = plane
}

/** Point an orthographic camera at a viewport-sized frustum, in CSS pixels. */
function frameCamera(camera: OrthographicCamera, size: Viewport): void {
    const frustum = pixelFrustum(size)

    camera.left = frustum.left
    camera.right = frustum.right
    camera.top = frustum.top
    camera.bottom = frustum.bottom
    camera.updateProjectionMatrix()
}

/**
 * How much world one device pixel covers, which is what the fragment shader measures
 * coverage against and what keeps a sub-pixel band from missing every sample.
 *
 * And how much one *css* pixel covers, which is the unit the thickness floor is quoted in —
 * a floor measured in device pixels would be half as tall on a retina display as on the
 * screen beside it, and the number was chosen by looking.
 */
function setCoverage(material: RawShaderMaterial, zoom: number, pixelRatio: number): void {
    const pixel = devicePixel(zoom, pixelRatio)

    material.uniforms.uHalfPixel.value = pixel * 0.5
    material.uniforms.uPad.value = pixel
    material.uniforms.uFloorPixel.value = pixel * pixelRatio
}

/**
 * The shared mesh, and the only geometry in the scene: `rungs` quads spanning the curve
 * parameter from 0 to 1, two rows deep. Carries no positions — the vertex shader places
 * every vertex from the instance's six floats.
 */
function buildLadder(rungs: number): InstancedBufferGeometry {
    const params = new Float32Array((rungs + 1) * 4)
    const indices: number[] = []

    for (let i = 0; i <= rungs; i += 1) {
        const t = i / rungs
        const o = i * 4

        params[o] = t
        params[o + 1] = 0
        params[o + 2] = t
        params[o + 3] = 1

        if (i < rungs) {
            const upper = i * 2

            indices.push(upper, upper + 1, upper + 2, upper + 2, upper + 1, upper + 3)
        }
    }

    const geometry = new InstancedBufferGeometry()

    geometry.setAttribute('aParam', new BufferAttribute(params, 2))
    geometry.setIndex(indices)

    return geometry
}

/** Pull one field out of the parser's interleaved six-floats-per-band layout. */
function deinterleave(
    source: Float32Array,
    stride: number,
    offset: number,
    size: number,
    count: number
): InstancedBufferAttribute {
    const packed = new Float32Array(count * size)

    for (let i = 0; i < count; i += 1) {
        for (let c = 0; c < size; c += 1) {
            packed[i * size + c] = source[i * stride + offset + c]
        }
    }

    return new InstancedBufferAttribute(packed, size)
}
