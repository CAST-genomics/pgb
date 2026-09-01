/**
 * The frame every coordinate in this viewer is expressed in, derived from the document's
 * viewBox and from nothing else.
 *
 * The source's y points down and its origin is the viewBox's corner. Three.js's y points up
 * and PGB's camera sits at the origin with a symmetric frustum. Both differences are
 * resolved by subtracting the centre this returns:
 *
 *     world.x = source.x - centre.x
 *     world.y = centre.y - source.y
 *
 * So a `y` in world units names the **upper** edge of whatever it belongs to, and thickness
 * extends in **-y**. The flip is applied by the callers rather than here, because they
 * convert coordinates in bulk — a `Float32Array` written in place, a box read out of a
 * regex match — and a per-point function call is not the shape either of them wants.
 *
 * **Extracted so that two readers cannot disagree about where the origin is.** `parseBands.ts`
 * reads the four numbers off an SVG `viewBox="…"` attribute; the band payload carries the
 * same four in `header.document.viewBox`, and its reader (#143, ADR `0005`) is to hand them
 * here too. Each reader keeps its own way of finding them — finding them is part of reading
 * a format — and neither derives the frame itself. Two readers computing
 * the centre separately can drift, and the symptom of that drift is the segment boxes
 * sitting a few units off the bands: invisible in review, obvious in a screenshot six weeks
 * later. Hence nothing here is named for SVG.
 */

import type { Point, Size } from './geometry.ts'

export interface DocumentFrame {
    /** The centre subtracted above, in the document's own units. Anything reading the same
     *  document has to apply it to land in the same frame — which is what
     *  `parseSegmentBoxes` takes it for. */
    centre: Point
    /** Extent of the content, in world units. Centred on the origin. */
    content: Size
}

/**
 * The frame a document of this viewBox is drawn in. Pure arithmetic on four numbers: no
 * document, no text, no opinion about where they came from.
 */
export function documentFrame(minX: number, minY: number, width: number, height: number): DocumentFrame {
    return {
        centre: { x: minX + width * 0.5, y: minY + height * 0.5 },
        content: { width, height }
    }
}
