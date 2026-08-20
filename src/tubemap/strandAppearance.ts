/**
 * How each strand looks, as a table on the GPU: RGB and an emphasis byte per haplotype, and
 * a second plane of per-strand modifiers beside it.
 *
 * This replaces the per-instance colour attribute the spike shipped with, and the reason is
 * the whole of #39. Colour as an attribute means the appearance of a strand lives in as many
 * places as the strand has bands — 87 of them on `5520+`, scattered through the document —
 * so changing how one haplotype looks means finding and rewriting its share of a 162 KB
 * buffer. Here it means writing **one texel**. Nothing about the geometry moves, and the
 * instance buffer is never touched again after the document loads.
 *
 * ## The focus follows the cursor, and does not accumulate
 *
 * Exactly one strand is emphasized at a time: the one under the feeler right now. Moving on
 * hands the emphasis to the next strand and the previous one recedes with the rest.
 *
 * **This reverses what was asked for**, and the reversal is the user's, decided 2026-08-14
 * on looking at the built thing: #39's acceptance criteria, `SPEC.md` story 29 and
 * `CONTEXT.md` #14 all say touched strands *accumulate* into a comparison set. Swept across
 * a bundle, accumulation leaves a widening trail of lit strands behind the cursor, and the
 * one strand being pointed at is then one of dozens lit — which is the opposite of telling it
 * apart from its neighbours. A comparison set is still a real want; it needs a deliberate
 * gesture rather than the side effect of a sweep.
 *
 * The table itself is unchanged by that decision — it holds an emphasis byte per strand and
 * has no opinion about how many of them are lit, which is why a set could be lit from a
 * strand list or from PGB without touching this file.
 *
 * ## What the cost actually is
 *
 * Moving the focus writes one byte per *strand* — not per band, and not per lit strand — and
 * that figure does not depend on which strand, on how far the cursor moved, or on anything
 * about the document except how many haplotypes it has. The upload that follows is the whole
 * table: 4 KB at every strand count the survey found — two planes of 2 KB — at most once per
 * frame, because a frame is what consumes it.
 *
 * That is the number that retires the ~28 ms style invalidation of the SVG surface
 * (`CONTEXT.md` #15). Measured on a real GPU in `scripts/verify_highlight.mjs`.
 *
 * ## Emphasis is alpha, and colour is never touched
 *
 * The RGB half of a texel is the document's own colour for that strand and nothing ever
 * writes it again: PCLAI colour is shared vocabulary with PGB's 3D graph and its PCLAI
 * chart, and a researcher reads the three panels together
 * (`notes/sequence-tube-map/disambiguating-strands.md`, constraint 1). Only emphasis moves.
 *
 * The fragment shader multiplies coverage by emphasis, so a receded band becomes a ghost of
 * itself: whatever is behind it — the ground, or the focused strand it crosses — shows
 * through. Of the four treatments weighed in `notes/sequence-tube-map/disambiguating-strands.md` this is
 * "translucent", chosen over desaturation because grey already means something here
 * (`pclaiX="None"`, including `GRCh38#0#chr1`) and over removal because a haplotype's path
 * is read against its neighbours.
 *
 * **The focused strand's colour is exactly the document's**, and nothing here brightens it.
 * An earlier version gave it a floor of *ink* so that a sub-pixel band would not composite at
 * a fraction of its own colour; that is brightening the one rather than dimming the others,
 * which #39 forbids in as many words, and it was measured to buy nothing at fit on `5520+`
 * anyway. Removed 2026-08-14, and it stays removed.
 *
 * ## The thickness floor is the other half of that story, and is not the same treatment
 *
 * What the removed treatment was reaching for — legibility below one pixel per band — is a
 * **pixel budget**, and a pixel budget is answered in geometry rather than in tone (#112). At
 * fit on `5520+` a band is 0.19 css pixels tall and about 2.6 strands share every device
 * pixel row: receding the crowd does not change how much of a row the focused band owns, so
 * the strand still cannot be picked out. The floor gives it three or four device rows
 * outright, grown symmetrically about the band's own centreline so its *position* stays
 * exactly truthful even as its extent does not.
 *
 * The property that makes this defensible is that it is **self-annulling**. Above the floor
 * the clamp does nothing and the map is exactly as honest as it is today; below it is
 * precisely the regime where the overdrawn neighbours were never resolvable anyway. That is
 * the doctrine `notes/sequence-tube-map/rendering.md` already states for `uPad` — a feature's
 * size is corrected only where scale destroys information the feature carries — applied to
 * identity rather than colour.
 *
 * The floor is a **per-strand byte**, not a uniform, so the mechanism generalises to a set of
 * strands later without another upload path. Exactly one strand carries one today: the one
 * under the feeler.
 *
 * ## Why the table is two planes
 *
 * A texel was full — RGB is the document's colour and alpha is emphasis — so the floor needed
 * a byte that did not exist. The table is therefore the same 256-wide grid twice, stacked:
 * plane 0 is colour and emphasis, plane 1 is the strand's *modifiers*, of which the floor is
 * the first byte. A strand's two texels share a column and are `planeRows` apart, which is
 * the one number the vertex shader needs to reach the second.
 *
 * Stacked rather than widened because addressing stays the same arithmetic — `id % 256`,
 * `id / 256` — with one addition on the row. Two textures were the alternative and would have
 * meant two samplers, two uploads and two things to keep the same size as each other.
 *
 * ## Why a 256-wide grid rather than one long row
 *
 * `MAX_TEXTURE_SIZE` is only guaranteed to be 2048 in WebGL2, and the parser admits strand
 * ids up to 65535, so a table one texel high is a table that works until it doesn't. A row
 * of 256 caps the width and puts the whole admissible range inside 256 rows. The height
 * comes from the document's own strand count — 369, 378 and 464 all occur, and nothing here
 * may assume one of them — times the number of planes.
 */

import { DataTexture, NearestFilter } from 'three'
import type { ParsedMap } from './parseBands.ts'

/** Texels per row. See the note above: not a document quantity, a texture-size bound. */
export const APPEARANCE_ROW = 256

/** Colour and emphasis, then modifiers. A strand's two texels are `planeRows` apart. */
export const APPEARANCE_PLANES = 2

/**
 * Steps of thickness floor per css pixel: the floor is carried in 1/32 px steps, which puts
 * the whole sweep (1.0 to 3.0) on exact bytes and admits up to `FLOOR_CEILING_CSS_PX` before
 * the byte saturates. Read back the same way in the vertex shader.
 */
export const FLOOR_STEPS_PER_PX = 32

/** The tallest floor a byte can carry, 255 steps. Anything above this saturates to it. */
export const FLOOR_CEILING_CSS_PX = 255 / FLOOR_STEPS_PER_PX

/** A strand with no floor, which is every strand but the one under the feeler. */
export const NO_FLOOR = 0

/**
 * How thick the focused strand is drawn at minimum, in css pixels.
 *
 * Chosen by looking at a sweep on `5520+` at fit — 1.0, 1.5, 2.0 and 3.0 —
 * `notes/sequence-tube-map/measurements/2026-08-20-a-thickness-floor-at-fit.md` records the
 * photographs and why the other three lost.
 */
export const FLOOR_CSS_PX = 2

/**
 * A strand drawn as the document drew it: the whole map with no key held, and the focused
 * strand while the feeler is out. Emphasis is a multiplier on coverage, so this is 1.
 */
export const PLAIN = 255

/**
 * A strand the feeler is not on, while the feeler is out.
 *
 * 8% is dim enough that the focused strand reads out of a crowd of 463 instantly, and not so
 * dim that the crowd stops being there — the envelope of the bundle is the context that
 * makes a single path meaningful. Looked at on `5520+` at fit and zoomed, per
 * `notes/sequence-tube-map/disambiguating-strands.md` constraint 5.
 */
export const RECEDED = 20

/** The document's appearance table, and the only thing highlighting writes. */
export interface StrandAppearance {
    /** Sampled by strand id in the vertex shader. `APPEARANCE_ROW` texels per row. */
    texture: DataTexture
    width: number
    /** The whole table: `planeRows * APPEARANCE_PLANES`. */
    height: number
    /** Rows in one plane, and so the row offset from a strand's colour texel to its
     *  modifier texel. This is `uAppearancePlane` in the vertex shader. */
    planeRows: number
    /** The strand currently drawn in full, or null — either because the feeler is away or
     *  because it is over empty space. */
    focused(): number | null
    /**
     * Recede the map and draw `strandId` as the document drew it. `null` recedes everything,
     * which is what the feeler over empty space looks like — the mode is still on, so the
     * map must not spring back to full colour every time the cursor crosses a gap.
     *
     * True if the table changed, which is how the caller knows whether to schedule a frame.
     */
    focus(strandId: number | null): boolean
    /** Feeler away: the document's own appearance, nothing receded and nothing floored.
     *  True if it changed. */
    release(): boolean
    dispose(): void
}

export interface StrandAppearanceOptions {
    /**
     * The focused strand's minimum drawn thickness, in css pixels. Defaults to
     * `FLOOR_CSS_PX`; zero switches the floor off entirely, which is the control arm of the
     * sweep the value was chosen from (`?floor=` on `dev/tubemap.html`). Saturates at
     * `FLOOR_CEILING_CSS_PX`, which is a byte's worth and four times the tallest candidate
     * anyone has wanted to look at.
     */
    floorCssPx?: number
}

export function createStrandAppearance(
    map: Pick<ParsedMap, 'strandColors' | 'strandCount'>,
    options: StrandAppearanceOptions = {}
): StrandAppearance {

    const { strandCount } = map
    const width = APPEARANCE_ROW
    const planeRows = Math.max(1, Math.ceil(strandCount / APPEARANCE_ROW))
    const height = planeRows * APPEARANCE_PLANES
    const data = new Uint8Array(width * height * 4)

    // Rounded once, here, rather than per write: what the table carries is a byte, and the
    // byte is what the shader will act on, so it is also what the tests read.
    const floor = clampFloor(options.floorCssPx ?? FLOOR_CSS_PX)

    // Padding texels beyond the last strand are never sampled — ids come from the document
    // — but they are left plain rather than receded so that a table dumped for debugging
    // reads as "nothing is emphasized" rather than as a partially receded map. The modifier
    // plane is left at zero, which is the same statement: nothing is floored.
    data.fill(PLAIN, 0, planeRows * width * 4)

    for (let id = 0; id < strandCount; id += 1) {
        const at = texelOf(id, width)

        data[at] = map.strandColors[id * 3]
        data[at + 1] = map.strandColors[id * 3 + 1]
        data[at + 2] = map.strandColors[id * 3 + 2]
    }

    const texture = new DataTexture(data, width, height)

    // Nearest, and no mipmaps: the shader reads exact texels by integer id, so any
    // filtering here would only be a chance to blend two haplotypes' appearance together.
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true

    /** True while the feeler is out, which is what makes the unfocused strands recede. */
    let feeling = false
    let focus: number | null = null

    /**
     * Write what the feeler decides: the emphasis column, and the floor column beside it.
     *
     * Both are the same statement about the same one strand, so they are written in the same
     * pass and can never disagree — a floored strand that is not the emphasized one would be
     * a dilated band the researcher has no reason to be looking at.
     */
    function writeFeeler(): void {
        for (let id = 0; id < strandCount; id += 1) {
            const emphasized = false === feeling || id === focus

            data[texelOf(id, width) + 3] = emphasized ? PLAIN : RECEDED
            data[modifierOf(id, width, planeRows)] = id === focus ? floor : NO_FLOOR
        }

        texture.needsUpdate = true
    }

    return {

        texture,
        width,
        height,
        planeRows,

        focused(): number | null {
            return focus
        },

        focus(strandId: number | null): boolean {
            const wanted = null !== strandId && strandId >= 0 && strandId < strandCount
                ? strandId
                : null

            // A sweep re-reports the same haplotype for many frames running — a strand is 87
            // bands wide on `5520+` — so the common case is a move that changes nothing, and
            // saying so is what keeps a held pointer from uploading the same table forever.
            if (feeling && wanted === focus) {
                return false
            }

            feeling = true
            focus = wanted
            writeFeeler()

            return true
        },

        release(): boolean {
            if (false === feeling) {
                return false
            }

            feeling = false
            focus = null
            writeFeeler()

            return true
        },

        dispose(): void {
            texture.dispose()
        }
    }
}

/** Where a strand's texel starts, in bytes. The vertex shader's addressing, in TypeScript. */
function texelOf(strandId: number, width: number): number {
    return (Math.floor(strandId / APPEARANCE_ROW) * width + strandId % APPEARANCE_ROW) * 4
}

/** Where a strand's modifier texel starts: same column, one whole plane further down. */
function modifierOf(strandId: number, width: number, planeRows: number): number {
    return texelOf(strandId, width) + planeRows * width * 4
}

/** The floor as the byte the table carries, saturating rather than wrapping. */
function clampFloor(cssPx: number): number {
    return Math.max(NO_FLOOR, Math.min(255, Math.round(cssPx * FLOOR_STEPS_PER_PX)))
}
