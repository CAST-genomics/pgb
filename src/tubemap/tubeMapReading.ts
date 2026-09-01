/**
 * What one response reads into, whichever encoding it arrived in.
 *
 * The two routes meet here, by different arithmetic and not by the same number of parsers.
 * `parseBandPayload.ts` produces the whole of this out of one header and one body;
 * on the document route `readTubeMap.ts` assembles it from two, `parseBands.ts` for the map
 * and `parseSegmentBoxes.ts` for the boxes, because a document says the two in two places.
 * Downstream of that line the difference is gone: `bandSurface` and `segmentOverlay` are
 * handed the same pair either way and cannot tell which route ran.
 *
 * It sits in its own module rather than beside a reader because the payload reader returns
 * it and `readTubeMap.ts` builds it: a type owned by either would make the other import
 * from the file that imports it.
 */

import type { ParsedMap } from './parseBands.ts'
import type { SegmentBox } from './parseSegmentBoxes.ts'

/** Everything the surface draws, out of one response. */
export interface TubeMapReading {
    map: ParsedMap
    /** Every segment box the render drew, in draw order. */
    boxes: SegmentBox[]
}
