/**
 * The name of the strand under the feeler, following the cursor.
 *
 * This is the first thing in the viewer that says *what* a strand is rather than which
 * integer it is. `parseBands` keeps `trackName` verbatim; this reads it out beside the
 * cursor for as long as the gesture holds, so a researcher who has isolated a haplotype
 * has something to write down.
 *
 * ## Why it is gated on the feeler and not on hover
 *
 * At fit about 2.6 strands share the device pixel row under the cursor, so an ungated
 * hover would name an arbitrary one of them, continuously, wherever the cursor sits on
 * the strip. Holding `Shift` is the act of picking one out of that crowd, and the name is
 * an answer to it — a name on screen always refers to the strand currently emphasized.
 *
 * ## Why it is not `.graph-tooltip`
 *
 * `segmentOverlay`'s tooltip is PGB's node tooltip borrowed outright: a card with a title
 * and a details table, positioned below-right of the cursor. This is one string. Lifting
 * that tooltip into a shared owner to serve both would buy a second abstraction for a
 * label that has no rows, no measure and no state — so the two are separate, and the
 * offsets keep them apart on the rare document where both are on screen at once (at fit
 * no segment box is wide enough to be drawn at all, so mostly they never meet). If the
 * label ever grows a second row, that is when merging them is worth reconsidering.
 *
 * Inert to the pointer, like the badge and the `?pick` readout: the map underneath keeps
 * answering, so the cursor is never over the label instead of over the strand it names.
 */

import { beside, type Point, type Size } from './geometry.ts'

/** How far the label sits from the cursor, in css pixels.
 *
 *  Above it, where `segmentOverlay`'s tooltip is below it — the one document-independent
 *  way to keep two things that follow the same cursor from stacking. */
const OFFSET = { x: 14, y: 12 }

export interface StrandLabel {
    /** Name `name` at `at`, in css pixels from the surface's top-left corner. Idempotent:
     *  a sweep re-reports the same haplotype for many frames running. */
    show(name: string, at: Point, within: Size): void
    /** Take the name off screen. Idempotent. */
    hide(): void
    destroy(): void
}

export function createStrandLabel(root: HTMLElement): StrandLabel {

    const element = root.ownerDocument.createElement('div')

    element.className = 'stm-strand-label'
    root.append(element)

    /** What is written on it, so a sweep along one strand does not rewrite the DOM 60
     *  times a second to say the same thing. */
    let shown: string | null = null
    /** Its own extent, measured on the frame the text last changed. Kept so that moving it
     *  — which happens every frame of a sweep — never reads layout back out of the DOM. */
    let size: Size = { width: 0, height: 0 }

    return {

        show(name: string, at: Point, within: Size): void {
            if (name !== shown) {
                element.textContent = name

                // Before measuring: `offsetWidth` on a `display: none` element is zero,
                // and the clamp below is measured against it.
                element.classList.add('is-shown')

                size = { width: element.offsetWidth, height: element.offsetHeight }
                shown = name
            }

            // `beside` horizontally — against the right edge the label goes to the left of
            // the cursor rather than under it, where it would hide the strand it names.
            // Vertically there is only one side worth being on, since below-right is the
            // segment tooltip's, so the top edge clamps instead of flipping.
            const left = beside(at.x, size.width, within.width, OFFSET.x)
            const top = Math.max(0, at.y - OFFSET.y - size.height)

            // A transform rather than `left`/`top`: it does not invalidate layout, so a
            // label moving with the cursor cannot turn the surface's own per-move
            // `getBoundingClientRect` into a forced reflow.
            element.style.transform = `translate(${left}px, ${top}px)`
        },

        hide(): void {
            if (null === shown) {
                return
            }

            shown = null
            element.classList.remove('is-shown')
        },

        destroy(): void {
            element.remove()
        }
    }
}
