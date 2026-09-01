/**
 * A response becomes a picture here, and this is the only place that knows there are two of
 * them.
 *
 * One picture arrives in two encodings — an SVG document, or the band payload — and both
 * reach the identical `TubeMapReading`. The payload is one reader, `parseBandPayload.ts`,
 * which returns the reading whole; a document is two, `parseBands.ts` and
 * `parseSegmentBoxes.ts`, because it says the map and the boxes in two places, and the
 * reading is assembled here. So `bandSurface`, `bandPicker`, `strandAppearance`,
 * `inversion`, `pclaiInset`, `strandLabel`, `segmentOverlay` and `navigator` never learn
 * which route ran, and neither does the surface that calls this: it hands over what the
 * fetch returned and gets back a map and its boxes. ADR `0005` records why there are two
 * readers and why the choice between them is a flag rather than a fallback.
 *
 * **The encoding is not passed in — it is the shape of what arrived.** `fetchDocument` reads
 * the body as text or as bytes according to the flag the host set, so a `string` is a
 * document and a `Uint8Array` is a payload, and there is no third state in which the two
 * could disagree about which one this is.
 *
 * The reading has no route-dependent hole in it. It had one until their
 * [#66](https://github.com/CAST-genomics/PangenomeAPI/issues/66): the payload carried each
 * segment box as the path command the document draws it with, and reading that string back
 * would have been a second copy of an outline grammar with a known expiry date, so the band
 * route drew no boxes. The box now travels as the five numbers it is.
 */

import { parseBandPayload } from './parseBandPayload.ts'
import { parseBands } from './parseBands.ts'
import { parseSegmentBoxes } from './parseSegmentBoxes.ts'
import type { TubeMapReading } from './tubeMapReading.ts'

export type { TubeMapReading } from './tubeMapReading.ts'

/**
 * Read `content` into the picture it describes, refusing the whole of it rather than drawing
 * part (`NonConformingTubeMap`).
 *
 * Both readings of a response happen before anything is built, and both can refuse it: a box
 * the grammar cannot read is a variant nobody would notice was missing, so it refuses the
 * whole map exactly as a non-conforming band does.
 */
export function readTubeMap(content: string | Uint8Array): TubeMapReading {

    if ('string' !== typeof content) {
        return parseBandPayload(content)
    }

    const map = parseBands(content)

    return { map, boxes: parseSegmentBoxes(content, map.centre) }
}
