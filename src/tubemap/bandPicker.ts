/**
 * Which haplotype is under the cursor.
 *
 * This is the capability the SVG surface lost. DOM hit-testing at 40,442 elements cost
 * ~28 ms per hover — far past a frame — and that measurement is half the reason the
 * renderer was replaced. `CONTEXT.md` #6 rejected canvas specifically to preserve
 * per-element hit-testing; this is where it returns, by a different route.
 *
 * ## The route
 *
 * A second pass over the same scene with a material that writes each band's `trackID` as
 * colour, rendered through a camera whose entire frustum is the one css pixel under the
 * cursor, into a one-texel-wide target that is then read back. No spatial index, no bounding boxes,
 * no per-band arithmetic on the CPU — the GPU already knows how to rasterize these bands,
 * and asking it "what did you put here" reuses that exactly.
 *
 * **A strand is 13 to 47 separate bands**, and `trackID` is what unites them, so the answer
 * is a haplotype rather than a fragment. That falls out of the attribute; nothing here
 * stitches anything. (`trackID` is the document's spelling of a strand id, and stays
 * spelled that way wherever the document is being quoted — see `parseBands.ts`.)
 *
 * ## Why one pixel, sampled N times
 *
 * The frustum is one css pixel wide and one css pixel tall, so almost every instance is
 * clipped after its vertex shader and rasterizes nothing. The vertex shader still runs for
 * all of them — that is the cost of this approach, and it is the number to watch if picking
 * ever gets slow.
 *
 * That one pixel is photographed into a **1 x N** target rather than a 1 x 1 one (#120).
 * The window does not grow; its resolution does. At fit on `5520+` **six haplotypes** lie
 * inside the cursor's css pixel on average and seven at the most, 0.19 world px apart, and a
 * single texel with no depth buffer answers with whichever was drawn last — five real answers
 * discarded, and nothing on screen saying they existed. Screen resolution is a display constraint, not a property of the
 * geometry, so the pass samples that same region as finely as it likes: each texel is
 * `1/N` css px of map, and the column read back is the strands under the cursor in the
 * vertical order they appear.
 *
 * **The set is self-annulling.** As the view magnifies, bands exceed a pixel and the count
 * falls; it reaches one exactly when the picture stops being ambiguous, and the answer is the
 * single id the 1 x 1 target gave. No mode and no threshold — the geometry answering honestly
 * at every zoom.
 *
 * `readRenderTargetPixels` is a synchronous readback and stalls the pipeline until the
 * pass finishes, so the milliseconds reported with each pick are honest: they include the
 * GPU work, not just the time to submit it.
 *
 * ## The pick material's contract
 *
 * The material handed in must be the band material's twin — same vertex shader, same
 * coverage uniforms — differing only in what it writes. This module drives `uHalfPixel`,
 * `uPad` and `uFloorPixel` on it, because the size of a pick sample is this module's business
 * and follows from the frustum and the target it builds. See `PICK_FRAGMENT` in
 * `bandSurface.ts` for what the fragments write and why alpha is the hit flag.
 *
 * **`uPad` is measured against the sample cell, not the css pixel.** The pad exists so a
 * hairline cannot fall between sample points; the cell is now `1/N` css px, so the pad is
 * too. Left at a whole css pixel every band would inflate across the entire column and the
 * readout would name strands that were never under the cursor.
 */

import {
    Color,
    OrthographicCamera,
    type RawShaderMaterial,
    type Scene,
    WebGLRenderTarget,
    type WebGLRenderer
} from 'three'
import { devicePixel, worldFromViewportPoint, type CameraView, type Viewport } from './bandCamera.ts'
import type { Point } from './geometry.ts'

/**
 * The strands inside the cursor's css pixel, and which of them the cursor is on.
 *
 * The two travel together everywhere they go — the label draws the set and marks one row, the
 * appearance table lights that same one — so they are one answer rather than two, and
 * `nearest` is an *index* rather than a second id. That is what makes "the lit strand is one
 * of the named strands" true by construction instead of by a lookup that could fail.
 */
export interface StrandColumn {
    /**
     * Every haplotype inside the cursor's css pixel, in the vertical order they appear on
     * screen — topmost first. Empty over empty space.
     *
     * A list rather than a winner (#120). One texel with no depth buffer answered *last in
     * document order wins*, which is the right answer to "which band put ink in this pixel"
     * and the wrong one to "what am I pointing at". Magnified far enough that every band
     * exceeds a pixel this has exactly one entry, and the caller cannot tell the difference
     * from what it got before.
     */
    strandIds: number[]
    /**
     * Index into `strandIds` of the strand whose sample lies closest to the cursor's own y.
     * `-1` exactly when `strandIds` is empty.
     *
     * This is what the emphasis and the thickness floor go to. Which one gets them is a
     * policy decision rather than a default, and `CONTEXT.md` §feeler is where it is stated.
     */
    nearest: number
}

/** What the cursor is over, and what asking cost. */
export interface Pick extends StrandColumn {
    /** Wall-clock milliseconds for the pass, including the readback stall. */
    milliseconds: number
}

export interface BandPicker {
    /** `point` is css pixels from the surface's top-left, as a pointer event reports it. */
    pick(point: Point, viewport: Viewport, view: CameraView): Pick
    dispose(): void
}

/**
 * How finely the cursor's css pixel is sampled: `1 x PICK_SAMPLES` texels, each `1/N` css px
 * of map.
 *
 * A measurement rather than a guess. It has to exceed strands-per-css-pixel at fit — measured
 * at 6.0 on `5520+`, 7 at the most — with enough margin that the thinnest band still owns
 * several samples: at 0.19 css px per band, 32 samples give it six. Finer than that costs the
 * same and buys only strands whose ink inside the pixel is under 3% of it.
 * `notes/sequence-tube-map/measurements/2026-08-21-how-finely-to-sample-a-pick.md` records the
 * sweep and why the other candidates lost.
 */
export const PICK_SAMPLES = 32

/**
 * The pixel the pick pass wrote, read back as a strand id.
 *
 * Alpha is the hit flag rather than a colour. The target is cleared to a fully
 * transparent black that no kept fragment can produce, so zero alpha means empty space
 * — not strand 0, which is a real haplotype on every document we have.
 *
 * `at` is a byte offset into a column of several such pixels.
 */
export function decodeStrandId(pixel: Uint8Array, at = 0): number | null {
    if (0 === pixel[at + 3]) {
        return null
    }

    // Low byte first, matching the two lines of GLSL that wrote it.
    return pixel[at] + pixel[at + 1] * 256
}

/**
 * The column the pick pass wrote, read back as the strands under the cursor, **top of the
 * screen first**, and which of them the cursor is on.
 *
 * One walk answers both, which is not merely thrift: the index is taken from the list *as it
 * is being built*, so the two can never describe different columns.
 *
 * Three things happen here and all are load-bearing.
 *
 * **The column is reversed.** `readRenderTargetPixels` hands back rows bottom-first, because
 * a framebuffer's origin is its bottom-left corner. The world the camera looks at has y up,
 * so row 0 is the *lowest* point on screen. Listing the strands in the order the researcher
 * sees them stacked means reading the column backwards.
 *
 * **Repeats are dropped, keeping the first.** A band covers several consecutive samples, and
 * one that laps back over a neighbour it already crossed covers a second run of them. Either
 * way the haplotype is named once, where it first appears from the top — so the list is a set
 * in screen order rather than a run-length picture of the column.
 *
 * **The nearest row wins, ties going upward.** The cursor is the middle of the window by
 * construction, the camera being centred on it, so the strand it is *on* is the one holding
 * the row nearest the middle. That is the nearest *sample*, which is as near as this pass can
 * speak to a centreline — the window is a css pixel and a cell is `1/N` of one. Scanning from
 * the top makes an exact tie, which an even sample count leaves reachable, go to the upper
 * strand: the one the list also names first.
 */
export function readStrandColumn(column: Uint8Array): StrandColumn {
    const rows = column.length / 4
    const middle = rows * 0.5

    const strandIds: number[] = []

    let nearest = -1
    let best = Infinity

    for (let row = rows - 1; row >= 0; row -= 1) {
        const id = decodeStrandId(column, row * 4)

        if (null === id) {
            continue
        }

        const at = strandIds.indexOf(id)
        const seen = at >= 0 ? at : strandIds.push(id) - 1
        const distance = Math.abs(row + 0.5 - middle)

        if (distance < best) {
            nearest = seen
            best = distance
        }
    }

    return { strandIds, nearest }
}

export function createBandPicker(
    renderer: WebGLRenderer,
    scene: Scene,
    material: RawShaderMaterial,
    samples: number = PICK_SAMPLES
): BandPicker {

    // One css pixel of map, centred on the cursor — identical to the window a 1x1 target
    // framed. What changed below it is how many texels that window is photographed into, so
    // the pick still answers about the pointer's own precision and not about the device
    // pixels the surface happens to be drawn with.
    const camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100)
    const target = new WebGLRenderTarget(1, samples)
    const column = new Uint8Array(samples * 4)
    const clearColor = new Color()

    return {

        pick(point: Point, viewport: Viewport, view: CameraView): Pick {
            const started = performance.now()
            const world = worldFromViewportPoint(point, viewport, view)

            camera.position.set(world.x, world.y, 5)
            camera.zoom = view.zoom
            camera.updateProjectionMatrix()

            // The sample cell: one css pixel of window divided by the texels it is
            // photographed into. Everything sub-cell is measured against this — the coverage
            // test's own extent, and the pad that keeps a band thinner than a cell from
            // falling between sample points and reporting empty space where the researcher
            // can plainly see a strand.
            //
            // `devicePixel` divides one css pixel by a ratio, and the ratio here is the
            // sample count. Sized to the screen's pixel instead, every band would inflate
            // across the whole column and the readout would name strands that were never
            // under the cursor.
            const cell = devicePixel(view.zoom, samples)

            material.uniforms.uHalfPixel.value = cell * 0.5
            material.uniforms.uPad.value = cell

            // No thickness floor in the pick pass: a css pixel of zero world size is how the
            // shared vertex shader is told there isn't one. The floor dilates the strand the
            // *previous* pick answered with, so honouring it here would let that answer widen
            // its own target and a sweep at fit could never get past it. See PICK_FRAGMENT.
            material.uniforms.uFloorPixel.value = 0

            renderer.getClearColor(clearColor)

            const clearAlpha = renderer.getClearAlpha()
            const restore = scene.overrideMaterial

            try {
                renderer.setClearColor(0x000000, 0)
                scene.overrideMaterial = material
                renderer.setRenderTarget(target)
                renderer.render(scene, camera)
                renderer.readRenderTargetPixels(target, 0, 0, 1, samples, column)
            } finally {
                // The renderer and the scene are the surface's own, so everything borrowed
                // is handed back here rather than left for the next frame to notice.
                renderer.setRenderTarget(null)
                renderer.setClearColor(clearColor, clearAlpha)
                scene.overrideMaterial = restore
            }

            return { ...readStrandColumn(column), milliseconds: performance.now() - started }
        },

        dispose(): void {
            target.dispose()
        }
    }
}
